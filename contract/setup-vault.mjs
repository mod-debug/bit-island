/**
 * AutoVault Setup Script
 *
 * Configures the vault after deployment:
 *  1. setRewardRate for MOTO and PILL
 *  2. fundRewards if the deployer holds tokens (approve + fund)
 *
 * Usage:  node setup-vault.mjs
 * Requires: contract/.env with MNEMONIC=...
 */
import { readFileSync, existsSync } from 'fs';
import {
    AddressTypes,
    Mnemonic,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { getContract, JSONRpcProvider, OP_20_ABI, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

// ── Config ─────────────────────────────────────────────────────────────────
const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';

const AUTO_VAULT_ADDRESS = 'opt1sqrs8ckv0qj22ses8zj80zwfnd8ew48rf5c84pzfd';
const MOTO_ADDRESS = 'opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds';
const PILL_ADDRESS = 'opt1sqp5gx9k0nrqph3sy3aeyzt673dz7ygtqxcfdqfle';

// Reward rate per block (18 decimals).
// 1e14 = 0.0001 token/block ≈ 5.256 tokens/year
const REWARD_RATE = 100_000_000_000_000n; // 1e14

// Amount to seed into reward pool. 10 tokens (18 decimals)
const SEED_AMOUNT = 10_000_000_000_000_000_000n;

// AutoVault ABI (minimal)
const AUTO_VAULT_ABI = [
    {
        name: 'setRewardRate',
        inputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'rate', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'fundRewards',
        inputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getVaultInfo',
        inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'totalStaked', type: ABIDataTypes.UINT256 },
            { name: 'totalShares', type: ABIDataTypes.UINT256 },
            { name: 'rewardRate', type: ABIDataTypes.UINT256 },
            { name: 'lastCompoundBlock', type: ABIDataTypes.UINT256 },
            { name: 'rewardPool', type: ABIDataTypes.UINT256 },
            { name: 'compoundFeeBps', type: ABIDataTypes.UINT256 },
            { name: 'withdrawFeeBps', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
];

// ── Load mnemonic ──────────────────────────────────────────────────────────
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
const mnemonicPhrase = envFile.MNEMONIC ?? process.env.MNEMONIC ?? process.argv[2];
if (!mnemonicPhrase) {
    console.error('No mnemonic found. Create contract/.env with MNEMONIC=...');
    process.exit(1);
}

const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
const mnemonic = new Mnemonic(mnemonicPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

console.log('=== AutoVault Setup ===');
console.log('Owner:', wallet.p2tr);
console.log('Vault:', AUTO_VAULT_ADDRESS);
console.log('');

// ── Helpers ────────────────────────────────────────────────────────────────

/** Convert bech32 string to Address object via RPC (contract addresses) */
async function toContractAddress(bech32) {
    return provider.getPublicKeyInfo(bech32, true);
}

/** Send a write transaction on a contract */
async function sendWrite(contract, methodName, args) {
    console.log(`  Simulating ${methodName}...`);
    const sim = await contract[methodName](...args);

    if (sim.revert !== undefined) {
        throw new Error(`Simulation reverted for ${methodName}: ${sim.revert}`);
    }

    console.log(`  Simulation OK. Broadcasting...`);
    const receipt = await sim.sendTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: 100_000n,
        feeRate: 5,
        network: NETWORK,
    });

    console.log(`  TX: ${receipt.transactionId || 'broadcast'}`);
    console.log('  Waiting 5s for propagation...');
    await new Promise((r) => setTimeout(r, 5000));
    return receipt;
}

// ── Main ───────────────────────────────────────────────────────────────────
try {
    // Resolve contract addresses via RPC
    console.log('Resolving contract addresses...');
    const motoAddr = await toContractAddress(MOTO_ADDRESS);
    const pillAddr = await toContractAddress(PILL_ADDRESS);
    const vaultAddr = await toContractAddress(AUTO_VAULT_ADDRESS);
    console.log('  Contract addresses resolved.');
    console.log('');

    // Use wallet.address directly for the owner (no RPC lookup needed)
    const ownerAddr = wallet.address;
    console.log('  Owner address object:', !!ownerAddr);

    // Get vault contract (set sender to owner)
    const vault = getContract(AUTO_VAULT_ADDRESS, AUTO_VAULT_ABI, provider, NETWORK, ownerAddr);

    // ── Step 1: Set reward rate for MOTO ────────────────────────────────────
    console.log('[1/4] Setting reward rate for MOTO...');
    await sendWrite(vault, 'setRewardRate', [motoAddr, REWARD_RATE]);
    console.log('  Done. Rate:', REWARD_RATE.toString());
    console.log('');

    // ── Step 2: Set reward rate for PILL ────────────────────────────────────
    console.log('[2/4] Setting reward rate for PILL...');
    await sendWrite(vault, 'setRewardRate', [pillAddr, REWARD_RATE]);
    console.log('  Done. Rate:', REWARD_RATE.toString());
    console.log('');

    // ── Step 3: Check MOTO balance and fund if possible ─────────────────────
    console.log('[3/4] Checking MOTO balance...');
    const moto = getContract(MOTO_ADDRESS, OP_20_ABI, provider, NETWORK, ownerAddr);
    const motoBalResult = await moto.balanceOf(ownerAddr);
    const motoBal = motoBalResult.properties?.balance ?? 0n;
    console.log(`  MOTO balance: ${motoBal.toString()}`);

    if (motoBal >= SEED_AMOUNT) {
        console.log('  Approving vault to spend MOTO...');
        await sendWrite(moto, 'increaseAllowance', [vaultAddr, SEED_AMOUNT]);
        console.log('  Funding MOTO reward pool...');
        await sendWrite(vault, 'fundRewards', [motoAddr, SEED_AMOUNT]);
        console.log(`  Funded 10 MOTO into reward pool.`);
    } else {
        console.log('  Pas assez de MOTO. Envoie des MOTO au deployer et relance.');
    }
    console.log('');

    // ── Step 4: Check PILL balance and fund if possible ─────────────────────
    console.log('[4/4] Checking PILL balance...');
    const pill = getContract(PILL_ADDRESS, OP_20_ABI, provider, NETWORK, ownerAddr);
    const pillBalResult = await pill.balanceOf(ownerAddr);
    const pillBal = pillBalResult.properties?.balance ?? 0n;
    console.log(`  PILL balance: ${pillBal.toString()}`);

    if (pillBal >= SEED_AMOUNT) {
        console.log('  Approving vault to spend PILL...');
        await sendWrite(pill, 'increaseAllowance', [vaultAddr, SEED_AMOUNT]);
        console.log('  Funding PILL reward pool...');
        await sendWrite(vault, 'fundRewards', [pillAddr, SEED_AMOUNT]);
        console.log(`  Funded 10 PILL into reward pool.`);
    } else {
        console.log('  Pas assez de PILL. Envoie des PILL au deployer et relance.');
    }
    console.log('');

    // ── Verify ──────────────────────────────────────────────────────────────
    console.log('=== Vérification ===');
    const motoInfo = await vault.getVaultInfo(motoAddr);
    const pillInfo = await vault.getVaultInfo(pillAddr);
    console.log('MOTO vault:', {
        rewardRate: motoInfo.properties?.rewardRate?.toString() ?? '0',
        rewardPool: motoInfo.properties?.rewardPool?.toString() ?? '0',
    });
    console.log('PILL vault:', {
        rewardRate: pillInfo.properties?.rewardRate?.toString() ?? '0',
        rewardPool: pillInfo.properties?.rewardPool?.toString() ?? '0',
    });

    console.log('');
    console.log('=== Setup Terminé ===');
} catch (err) {
    console.error('Setup failed:', err.message || err);
    process.exit(1);
}
