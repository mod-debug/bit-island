import { readFileSync, existsSync } from 'fs';
import { Mnemonic, AddressTypes, MLDSASecurityLevel } from '@btc-vision/transaction';
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
const mnemonic = new Mnemonic(mPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);

for (const idx of [0, 1, 2]) {
    const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, idx);
    const qpk = wallet.quantumPublicKeyHex;
    console.log(`Index ${idx}:`);
    console.log(`  P2TR: ${wallet.p2tr}`);
    console.log(`  ML-DSA pubkey (first 40 hex): ${qpk.substring(0, 40)}`);
    console.log(`  ML-DSA pubkey (last 40 hex):  ${qpk.substring(qpk.length - 40)}`);
    console.log(`  ML-DSA pubkey length: ${qpk.length / 2} bytes`);
    console.log('');
}
