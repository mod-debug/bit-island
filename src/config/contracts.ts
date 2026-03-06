import { networks, type Network } from '@btc-vision/bitcoin';
import { resolveNetwork } from './networks.js';

/** Wallet address allowed to view the Admin tab. */
export const ADMIN_WALLET = 'opt1p54h7vktvz0edgu0km6k9r5w59awng56z2xwwl0y2vwyplugpm43szsy5zr';

export interface ContractAddresses {
    readonly nft: string;
    readonly otcEscrow: string;
    readonly vestingVault: string;
    readonly nftEscrow: string;
    readonly noSmileNft: string;
    readonly autoVault: string;
}

/**
 * Contract addresses keyed by network bech32 prefix.
 * Replace placeholder values with real deployed addresses.
 */
const CONTRACT_ADDRESSES: Map<string, ContractAddresses> = new Map([
    [
        networks.bitcoin.bech32,
        {
            nft: 'MAINNET_NFT_ADDRESS_HERE',
            otcEscrow: 'MAINNET_OTC_ESCROW_ADDRESS_HERE',
            vestingVault: 'MAINNET_VESTING_VAULT_ADDRESS_HERE',
            nftEscrow: 'MAINNET_NFT_ESCROW_ADDRESS_HERE',
            noSmileNft: 'MAINNET_NOSMILE_NFT_ADDRESS_HERE',
            autoVault: 'MAINNET_AUTO_VAULT_ADDRESS_HERE',
        },
    ],
    [
        networks.opnetTestnet.bech32,
        {
            nft: 'TESTNET_NFT_ADDRESS_HERE',
            otcEscrow: 'opt1sqpwtyzjt23zfsevqd6km537xjyuwd39xruc24n3y',
            vestingVault: 'opt1sqpgfm7ltx5hkh2m9yhha4cwqt64plk7weva7w3jq',
            nftEscrow: 'opt1sqrzrh5c4e6vmkelpgycjju6j720wlxd0lude4hep',
            noSmileNft: 'opt1sqrumw78eg009xm0xq7y5hj447ck9rxj98s2pp70a',
            autoVault: 'opt1sqzewq5lr70pzsk76yl9wv2z59kvstg6s8cqtwhqf',
        },
    ],
    [
        networks.regtest.bech32,
        {
            nft: 'bcrt1q0000000000000000000000000000000000000000',
            otcEscrow: 'bcrt1q0000000000000000000000000000000000000001',
            vestingVault: 'bcrt1q0000000000000000000000000000000000000002',
            nftEscrow: 'bcrt1q0000000000000000000000000000000000000003',
            noSmileNft: 'bcrt1q0000000000000000000000000000000000000004',
            autoVault: 'bcrt1q0000000000000000000000000000000000000005',
        },
    ],
]);

function getAddresses(network: Network): ContractAddresses {
    const canonical = resolveNetwork(network);
    const addresses = CONTRACT_ADDRESSES.get(canonical.bech32);
    if (addresses === undefined) throw new Error(`No addresses configured for network: ${canonical.bech32}`);
    return addresses;
}

export function getNFTAddress(network: Network): string {
    return getAddresses(network).nft;
}

export function getOTCEscrowAddress(network: Network): string {
    const addr = getAddresses(network).otcEscrow;
    if (addr.startsWith('TESTNET_') || addr.startsWith('MAINNET_')) {
        throw new Error(`OTC Escrow not yet deployed on ${resolveNetwork(network).bech32}`);
    }
    return addr;
}

export function getVestingVaultAddress(network: Network): string {
    const addr = getAddresses(network).vestingVault;
    if (addr.startsWith('TESTNET_') || addr.startsWith('MAINNET_')) {
        throw new Error(`Vesting Vault not yet deployed on ${resolveNetwork(network).bech32}`);
    }
    return addr;
}

export function getNFTEscrowAddress(network: Network): string {
    const addr = getAddresses(network).nftEscrow;
    if (addr.startsWith('TESTNET_') || addr.startsWith('MAINNET_')) {
        throw new Error(`NFT Escrow not yet deployed on ${resolveNetwork(network).bech32}`);
    }
    return addr;
}

export function getNoSmileAddress(network: Network): string {
    const addr = getAddresses(network).noSmileNft;
    if (addr.startsWith('TESTNET_') || addr.startsWith('MAINNET_')) {
        throw new Error(`No Smile NFT not yet deployed on ${resolveNetwork(network).bech32}`);
    }
    return addr;
}

export function getAutoVaultAddress(network: Network): string {
    const addr = getAddresses(network).autoVault;
    if (addr.startsWith('TESTNET_') || addr.startsWith('MAINNET_')) {
        throw new Error(`Auto Vault not yet deployed on ${resolveNetwork(network).bech32}`);
    }
    return addr;
}
