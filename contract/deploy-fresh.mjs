/**
 * Deploy AutoVault with a FRESH mnemonic (no ML-DSA conflicts).
 * 1. Generate new mnemonic
 * 2. Fund it from index 0 of old wallet
 * 3. Deploy with link=true
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import {
    AddressTypes,
    TransactionFactory,
    Mnemonic,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';
const WASM_PATH = './build/AutoVault.wasm';

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

const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
const factory = new TransactionFactory();

// Step 1: Generate fresh mnemonic
const step = process.argv[2] || 'fund';

if (step === 'fund') {
    // Load old wallet to fund the new one
    const envFile = loadEnvFile('./.env');
    const oldPhrase = envFile.MNEMONIC || process.env.MNEMONIC;
    const oldMnemonic = new Mnemonic(oldPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const oldWallet = oldMnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

    // Generate new mnemonic
    const freshMnemonic = Mnemonic.generate(undefined, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const freshPhrase = freshMnemonic.phrase;
    const freshWallet = freshMnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

    console.log('=== Fresh Mnemonic Generated ===');
    console.log('Fresh wallet:', freshWallet.p2tr);
    console.log('');

    // Save fresh mnemonic to file
    writeFileSync('./.env-fresh', `MNEMONIC_FRESH=${freshPhrase}\n`);
    console.log('Saved to .env-fresh (DO NOT SHARE)');
    console.log('');

    // Fund from old wallet
    const utxos = await provider.utxoManager.getUTXOs({ address: oldWallet.p2tr });
    const total = utxos.reduce((s, u) => s + u.value, 0n);
    console.log('Old wallet:', oldWallet.p2tr);
    console.log('Old wallet UTXOs:', utxos.length, 'Total:', total, 'sat');

    if (utxos.length === 0) {
        console.error('No UTXOs in old wallet!');
        process.exit(1);
    }

    const AMOUNT = 500_000n;
    console.log(`Sending ${AMOUNT} sat to fresh wallet...`);

    const result = await factory.createBTCTransfer({
        from: oldWallet.p2tr,
        to: freshWallet.p2tr,
        utxos,
        signer: oldWallet.keypair,
        mldsaSigner: oldWallet.mldsaKeypair,
        network: NETWORK,
        feeRate: 5,
        priorityFee: 0n,
        gasSatFee: 0n,
        amount: AMOUNT,
    });

    const broadcast = await provider.sendRawTransaction(result.tx, false);
    console.log('Funding TX success:', broadcast.success);
    console.log('Funding TX ID:', broadcast.result);
    console.log('');
    console.log('Wait for confirmation, then run:');
    console.log('  node deploy-fresh.mjs deploy');

} else if (step === 'deploy') {
    // Load fresh mnemonic
    const envFresh = loadEnvFile('./.env-fresh');
    const freshPhrase = envFresh.MNEMONIC_FRESH;
    if (!freshPhrase) {
        console.error('No fresh mnemonic found. Run "node deploy-fresh.mjs fund" first.');
        process.exit(1);
    }

    const freshMnemonic = new Mnemonic(freshPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const freshWallet = freshMnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

    console.log('=== Deploying from Fresh Wallet ===');
    console.log('Wallet:', freshWallet.p2tr);

    const utxos = await provider.utxoManager.getUTXOs({ address: freshWallet.p2tr });
    const total = utxos.reduce((s, u) => s + u.value, 0n);
    console.log('UTXOs:', utxos.length, 'Total:', total, 'sat');

    if (utxos.length === 0) {
        console.error('No UTXOs! Wait for funding TX to confirm.');
        process.exit(1);
    }

    const challenge = await provider.getChallenge();
    const bytecode = readFileSync(WASM_PATH);
    console.log('Bytecode:', bytecode.length, 'bytes');

    // Calldata: deployer address (32 bytes)
    const calldata = freshWallet.address;

    const deployment = await factory.signDeployment({
        from: freshWallet.p2tr,
        utxos,
        signer: freshWallet.keypair,
        mldsaSigner: freshWallet.mldsaKeypair,
        network: NETWORK,
        feeRate: 5,
        priorityFee: 0n,
        gasSatFee: 10_000n,
        bytecode,
        calldata,
        challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    });

    console.log('Contract address:', deployment.contractAddress);
    console.log('');

    console.log('Broadcasting funding TX...');
    const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
    if (!fundingResult.success) {
        console.error('Funding TX failed:', fundingResult.error);
        process.exit(1);
    }
    console.log('Funding TX:', fundingResult.result);

    console.log('Waiting 5s...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('Broadcasting reveal TX...');
    const revealResult = await provider.sendRawTransaction(deployment.transaction[1], false);
    if (!revealResult.success) {
        console.error('Reveal TX failed:', revealResult.error);
        process.exit(1);
    }
    console.log('Reveal TX:', revealResult.result);

    console.log('');
    console.log('=== Done ===');
    console.log('Update src/config/contracts.ts:');
    console.log(`  autoVault: '${deployment.contractAddress}'`);
}
