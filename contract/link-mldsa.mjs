/**
 * Link ML-DSA key to index 1 wallet via a simple BTC self-transfer.
 * This needs to happen BEFORE contract deployment.
 */
import { readFileSync, existsSync } from 'fs';
import {
    Mnemonic,
    AddressTypes,
    MLDSASecurityLevel,
    TransactionFactory,
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
const RPC_URL = 'https://testnet.opnet.org';
const envFile = loadEnvFile('./.env');
const mPhrase = envFile.MNEMONIC || process.env.MNEMONIC;
const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
const mnemonic = new Mnemonic(mPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);

const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);
console.log('Wallet (index 1):', wallet.p2tr);

// Fetch UTXOs
const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
const total = utxos.reduce((sum, u) => sum + u.value, 0n);
console.log(`UTXOs: ${utxos.length}, Total: ${total} sat`);

if (utxos.length === 0) {
    console.error('No UTXOs! Fund index 1 first.');
    process.exit(1);
}

// Self-transfer with ML-DSA key linking
const AMOUNT = 10_000n;
console.log(`Self-transfer ${AMOUNT} sat with linkMLDSA=true...`);

const factory = new TransactionFactory();
const result = await factory.createBTCTransfer({
    from: wallet.p2tr,
    to: wallet.p2tr,  // self-transfer
    utxos,
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    network: NETWORK,
    feeRate: 5,
    priorityFee: 0n,
    gasSatFee: 0n,
    amount: AMOUNT,
    linkMLDSAPublicKeyToAddress: true,
    revealMLDSAPublicKey: true,
});

console.log('Broadcasting...');
const broadcast = await provider.sendRawTransaction(result.tx, false);
console.log('Success:', broadcast.success);
console.log('TX ID:', broadcast.result);
if (broadcast.error) console.log('Error:', broadcast.error);
