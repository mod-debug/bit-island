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

const wallet0 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
const wallet1 = mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);

console.log('From (index 0):', wallet0.p2tr);
console.log('To   (index 1):', wallet1.p2tr);

// Fetch UTXOs for wallet 0
const utxos = await provider.utxoManager.getUTXOs({ address: wallet0.p2tr });
const total = utxos.reduce((sum, u) => sum + u.value, 0n);
console.log(`UTXOs: ${utxos.length}, Total: ${total} sat`);

// Send ~2M sat to wallet1 (enough for deployment + gas)
const AMOUNT = 2_000_000n;
console.log(`Sending ${AMOUNT} sat to index 1...`);

const factory = new TransactionFactory();
const result = await factory.createBTCTransfer({
    from: wallet0.p2tr,
    to: wallet1.p2tr,
    utxos,
    signer: wallet0.keypair,
    mldsaSigner: wallet0.mldsaKeypair,
    network: NETWORK,
    feeRate: 5,
    priorityFee: 0n,
    gasSatFee: 0n,
    amount: AMOUNT,
});

console.log('Broadcasting...');
const broadcast = await provider.sendRawTransaction(result.tx, false);
console.log('Success:', broadcast.success);
console.log('TX ID:', broadcast.result);
if (broadcast.error) console.log('Error:', broadcast.error);
