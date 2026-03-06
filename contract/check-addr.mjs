import { readFileSync, existsSync } from 'fs';
import { Mnemonic, AddressTypes, MLDSASecurityLevel, Address } from '@btc-vision/transaction';
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

const envFile = loadEnvFile('./.env');
const mPhrase = envFile.MNEMONIC || process.env.MNEMONIC;
const mnemonic = new Mnemonic(mPhrase, '', networks.opnetTestnet, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

console.log('p2tr:', wallet.p2tr);

// Explore all wallet properties
const props = Object.getOwnPropertyNames(wallet);
const protoProps = Object.getOwnPropertyNames(Object.getPrototypeOf(wallet));
console.log('Own props:', props);
console.log('Proto props:', protoProps);

// Check quantum-related properties
for (const p of [...props, ...protoProps]) {
    try {
        const val = wallet[p];
        if (val !== undefined && val !== null && typeof val !== 'function') {
            if (typeof val === 'string' && val.length < 200) {
                console.log(`  ${p}:`, val);
            } else if (val instanceof Uint8Array) {
                console.log(`  ${p}: Uint8Array(${val.length})`);
            } else if (typeof val === 'object' && val.length !== undefined) {
                console.log(`  ${p}: [length=${val.length}]`);
            }
        }
    } catch(e) { /* skip */ }
}
