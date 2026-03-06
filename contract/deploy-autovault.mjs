/**
 * AutoVault Deployment Script
 *
 * Option 1 — .env file (recommended, never appears in shell history):
 *   Create contract/.env with:  MNEMONIC=word1 word2 ... word12
 *   Then run:  node deploy-autovault.mjs
 *
 * Option 2 — env variable:
 *   MNEMONIC="word1 word2 ... word12" node deploy-autovault.mjs
 *
 * Option 3 — command-line arg (shows in history, not recommended):
 *   node deploy-autovault.mjs "word1 word2 ... word12"
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

// ── Config ─────────────────────────────────────────────────────────────────
const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';
const WASM_PATH = './build/AutoVault.wasm';
const FEE_RATE = 5;
const GAS_SAT_FEE = 10_000n;

// ── Mnemonic resolution (env file → env var → CLI arg) ─────────────────────
function loadEnvFile(path) {
    if (!existsSync(path)) return {};
    const lines = readFileSync(path, 'utf8').split('\n');
    const env = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
}

const envFile = loadEnvFile('./.env');
const mnemonicPhrase =
    envFile.MNEMONIC ??
    process.env.MNEMONIC ??
    process.argv[2];

if (!mnemonicPhrase) {
    console.error('No mnemonic found. Create contract/.env with:');
    console.error('  MNEMONIC=word1 word2 ... word12');
    process.exit(1);
}

const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
const mnemonic = new Mnemonic(mnemonicPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 1); // Index 1 — fresh ML-DSA key
const factory = new TransactionFactory();

console.log('=== AutoVault Deployment ===');
console.log('Deployer address:', wallet.p2tr);
console.log('Network:', NETWORK.bech32);
console.log('RPC:', RPC_URL);
console.log('');

// Get UTXOs
console.log('Fetching UTXOs...');
const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
if (utxos.length === 0) {
    console.error('No UTXOs found. Fund your address on testnet first.');
    process.exit(1);
}
console.log(`Found ${utxos.length} UTXO(s)`);

// Get challenge
console.log('Getting challenge...');
const challenge = await provider.getChallenge();

// Load bytecode
const bytecode = readFileSync(WASM_PATH);
console.log(`Bytecode size: ${bytecode.length} bytes`);

// Build calldata: deployer address (32 bytes) for onDeployment()
const deployerAddress = wallet.address; // Uint8Array(32)
console.log(`Deployer address bytes: ${Array.from(deployerAddress).map(b => b.toString(16).padStart(2, '0')).join('')}`);

// Build deployment params
const deploymentParams = {
    from: wallet.p2tr,
    utxos,
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    network: NETWORK,
    feeRate: FEE_RATE,
    priorityFee: 0n,
    gasSatFee: GAS_SAT_FEE,
    bytecode,
    calldata: deployerAddress,
    challenge,
    linkMLDSAPublicKeyToAddress: false,
    revealMLDSAPublicKey: false,
};

// Sign
console.log('Signing deployment...');
const deployment = await factory.signDeployment(deploymentParams);
console.log('');
console.log('AutoVault contract address:', deployment.contractAddress);
console.log('');

// Broadcast
console.log('Broadcasting funding TX...');
const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
if (!fundingResult.success) {
    console.error('Funding TX failed:', fundingResult.error);
    process.exit(1);
}
console.log('Funding TX ID:', fundingResult.result);

// Wait for funding TX to propagate before sending reveal
console.log('Waiting 5s for propagation...');
await new Promise((resolve) => setTimeout(resolve, 5000));

console.log('Broadcasting reveal TX...');
const revealResult = await provider.sendRawTransaction(deployment.transaction[1], false);
if (!revealResult.success) {
    console.error('Reveal TX failed:', revealResult.error);
    process.exit(1);
}
console.log('Reveal TX ID:', revealResult.result);

console.log('');
console.log('=== AutoVault Deployment Complete ===');
console.log('');
console.log('Update src/config/contracts.ts with:');
console.log(`  autoVault: '${deployment.contractAddress}'`);
