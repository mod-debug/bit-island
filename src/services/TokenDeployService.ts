import type { AbstractRpcProvider } from 'opnet';
import type { Network } from '@btc-vision/bitcoin';
import type { DeploymentResult } from '../types/index.js';

interface Web3DeployParams {
    readonly bytecode: Uint8Array;
    readonly calldata?: Uint8Array;
    readonly utxos: unknown[];
    readonly feeRate: number;
    readonly priorityFee: bigint;
    readonly gasSatFee: bigint;
    readonly from: string;
}

interface WalletDeployResult {
    readonly contractAddress: string;
    readonly contractPubKey: string;
    readonly transaction: readonly [string, string];
}

interface OPNetWeb3 {
    deployContract(params: Web3DeployParams): Promise<WalletDeployResult>;
}

interface OPNetWindow {
    opnet?: { web3: OPNetWeb3 };
}

async function loadOP20Wasm(): Promise<Uint8Array> {
    const res = await fetch('./OP20Token.wasm');
    if (!res.ok) throw new Error('OP20 WASM not found. Please compile and place OP20Token.wasm in /public.');
    return new Uint8Array(await res.arrayBuffer());
}

/**
 * Encode OP20 constructor parameters as calldata.
 * Matches the contract's onDeployment read order:
 *   readStringWithLength() → name   [u32 BE length prefix + UTF-8 bytes]
 *   readStringWithLength() → symbol [u32 BE length prefix + UTF-8 bytes]
 *   readU256()             → maxSupply [32 bytes BE]
 *   readU8()               → decimals  [1 byte]
 */
function encodeConstructorCalldata(
    name: string,
    symbol: string,
    decimals: number,
    maxSupply: bigint,
): Uint8Array {
    const enc = new TextEncoder();
    const nameBytes = enc.encode(name);
    const symbolBytes = enc.encode(symbol);

    // Total size: 4+name + 4+symbol + 32 + 1
    const total = 4 + nameBytes.length + 4 + symbolBytes.length + 32 + 1;
    const buf = new Uint8Array(total);
    const view = new DataView(buf.buffer);

    let offset = 0;

    // name: u32 BE length + bytes
    view.setUint32(offset, nameBytes.length, false); offset += 4;
    buf.set(nameBytes, offset); offset += nameBytes.length;

    // symbol: u32 BE length + bytes
    view.setUint32(offset, symbolBytes.length, false); offset += 4;
    buf.set(symbolBytes, offset); offset += symbolBytes.length;

    // maxSupply: 32 bytes big-endian
    let val = maxSupply;
    for (let i = 31; i >= 0; i--) {
        buf[offset + i] = Number(val & 0xffn);
        val >>= 8n;
    }
    offset += 32;

    // decimals: 1 byte
    view.setUint8(offset, decimals);

    return buf;
}

/**
 * Deploy a new OP20 token via OpWallet, then broadcast both transactions.
 */
export async function deployToken(
    name: string,
    symbol: string,
    decimals: number,
    maxSupply: bigint,
    walletAddress: string,
    provider: AbstractRpcProvider,
    _network: Network,
): Promise<DeploymentResult> {
    const win = window as unknown as OPNetWindow;
    const web3 = win.opnet?.web3;
    if (web3 === undefined) {
        throw new Error('OP_WALLET not found. Please install and connect OP_WALLET.');
    }

    const bytecode = await loadOP20Wasm();
    const calldata = encodeConstructorCalldata(name, symbol, decimals, maxSupply);

    const gasParams = await provider.gasParameters();
    const feeRate: number = gasParams.bitcoin.recommended.medium;

    const utxos = await provider.utxoManager.getUTXOs({
        address: walletAddress,
        optimize: true,
        mergePendingUTXOs: true,
        filterSpentUTXOs: true,
    });

    if (utxos.length === 0) {
        throw new Error('No UTXOs found. Make sure you have tBTC to pay fees.');
    }

    const signed = await web3.deployContract({
        bytecode,
        calldata,
        utxos,
        feeRate,
        priorityFee: 0n,
        gasSatFee: 0n,
        from: walletAddress,
    });

    const fundingBroadcast = await provider.sendRawTransaction(signed.transaction[0], false);
    if (!fundingBroadcast.success) {
        throw new Error(`Funding TX failed: ${fundingBroadcast.error ?? 'unknown'}`);
    }

    const deployBroadcast = await provider.sendRawTransaction(signed.transaction[1], false);
    if (!deployBroadcast.success) {
        throw new Error(`Deploy TX failed: ${deployBroadcast.error ?? 'unknown'}`);
    }

    return {
        contractAddress: signed.contractAddress,
        contractPubKey: signed.contractPubKey,
        fundingTxId: fundingBroadcast.result ?? '(unknown)',
        deployTxId: deployBroadcast.result ?? '(unknown)',
    };
}
