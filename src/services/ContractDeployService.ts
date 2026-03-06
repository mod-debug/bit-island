import type { AbstractRpcProvider } from 'opnet';
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

/**
 * Load a WASM binary from the public folder.
 */
async function loadWasm(path: string): Promise<Uint8Array> {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`WASM not found at ${path}. Make sure the file is in /public.`);
    return new Uint8Array(await res.arrayBuffer());
}

/**
 * Deploy any compiled contract via OPWallet.
 *
 * @param wasmPath - Path to the WASM file in public/ (e.g. './NoSmileNFT.wasm')
 * @param walletAddress - Connected wallet address
 * @param provider - OPNet RPC provider
 * @param calldata - Optional constructor calldata (most contracts don't need it)
 */
export async function deployContract(
    wasmPath: string,
    walletAddress: string,
    provider: AbstractRpcProvider,
    calldata?: Uint8Array,
): Promise<DeploymentResult> {
    const win = window as unknown as OPNetWindow;
    const web3 = win.opnet?.web3;
    if (web3 === undefined) {
        throw new Error('OP_WALLET not found. Please install and connect OP_WALLET.');
    }

    const bytecode = await loadWasm(wasmPath);

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

    const params: Web3DeployParams = {
        bytecode,
        utxos,
        feeRate,
        priorityFee: 1000n,
        gasSatFee: 10_000n,
        from: walletAddress,
    };

    if (calldata !== undefined) {
        (params as unknown as Record<string, unknown>).calldata = calldata;
    }

    const signed = await web3.deployContract(params);

    const fundingBroadcast = await provider.sendRawTransaction(signed.transaction[0], false);
    if (!fundingBroadcast.success) {
        throw new Error(`Funding TX failed: ${fundingBroadcast.error ?? 'unknown'}`);
    }

    // Wait for funding TX to propagate before broadcasting deploy TX
    await new Promise<void>((r) => { setTimeout(r, 3000); });

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
