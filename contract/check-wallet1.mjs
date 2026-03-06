import { readFileSync, existsSync } from 'fs';
import { Mnemonic, AddressTypes, MLDSASecurityLevel } from '@btc-vision/transaction';
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

// Check index 0 and index 1
for (const idx of [0, 1, 2]) {
    const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, idx);
    console.log(`\n=== Index ${idx} ===`);
    console.log('P2TR:', wallet.p2tr);

    try {
        const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
        const total = utxos.reduce((sum, u) => sum + u.value, 0n);
        console.log(`UTXOs: ${utxos.length}, Total: ${total} sat`);
    } catch (e) {
        console.log('UTXOs: error -', e.message);
    }
}
