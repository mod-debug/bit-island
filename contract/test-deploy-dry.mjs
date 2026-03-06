/**
 * Dry-run test: sign a deployment from index 2 with link=true
 * Just to see if signDeployment itself fails, without broadcasting.
 */
import { readFileSync, existsSync } from 'fs';
import {
    AddressTypes,
    TransactionFactory,
    Mnemonic,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

function loadEnvFile(path) {
    if (!existsSync(path)) return {};
    const lines = readFileSync(path, 'utf8').split('\n');
    const env = {};
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq === -1) continue;
        env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
    return env;
}

const NETWORK = networks.opnetTestnet;
const envFile = loadEnvFile('./.env');
const mPhrase = envFile.MNEMONIC || process.env.MNEMONIC;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: NETWORK });
const mnemonic = new Mnemonic(mPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);

// Try index 1 (has UTXOs) but with link=true — just sign, broadcast ONLY funding TX
const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);
console.log('Wallet index 1:', wallet.p2tr);

const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
console.log('UTXOs:', utxos.length, 'Total:', utxos.reduce((s,u) => s + u.value, 0n), 'sat');

const challenge = await provider.getChallenge();
const bytecode = readFileSync('./build/AutoVault.wasm');

// Sign with link=true
const factory = new TransactionFactory();
const deployment = await factory.signDeployment({
    from: wallet.p2tr,
    utxos,
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    network: NETWORK,
    feeRate: 5,
    priorityFee: 0n,
    gasSatFee: 10_000n,
    bytecode,
    calldata: wallet.address,
    challenge,
    linkMLDSAPublicKeyToAddress: true,
    revealMLDSAPublicKey: true,
});

console.log('Contract address:', deployment.contractAddress);
console.log('');

// ONLY broadcast funding TX — NOT the reveal TX
console.log('Broadcasting ONLY funding TX (to link ML-DSA key)...');
const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
console.log('Funding TX success:', fundingResult.success);
console.log('Funding TX ID:', fundingResult.result);
if (fundingResult.error) console.log('Funding TX error:', fundingResult.error);

console.log('');
console.log('NOT broadcasting reveal TX.');
console.log('Wait for funding TX to be in a block, then check ML-DSA linking.');
console.log('Then deploy again with link=false.');
