import { networks, type Network } from '@btc-vision/bitcoin';

export interface NetworkConfig {
    readonly name: string;
    readonly rpcUrl: string;
    readonly explorerUrl: string;
}

/**
 * Normalize any Network object to one of the three canonical singletons.
 * WalletConnectNetwork extends Network but may not be the same object reference,
 * so we compare by bech32 prefix (unique per network).
 */
export function resolveNetwork(network: Network): Network {
    if (network.bech32 === networks.bitcoin.bech32) return networks.bitcoin;
    if (network.bech32 === networks.opnetTestnet.bech32) return networks.opnetTestnet;
    if (network.bech32 === networks.regtest.bech32) return networks.regtest;
    // Fallback: return as-is (covers any future network)
    return network;
}

const NETWORK_CONFIGS: Map<string, NetworkConfig> = new Map([
    [
        networks.bitcoin.bech32,
        {
            name: 'Mainnet',
            rpcUrl: 'https://mainnet.opnet.org',
            explorerUrl: 'https://explorer.opnet.org',
        },
    ],
    [
        networks.opnetTestnet.bech32,
        {
            name: 'OPNet Testnet',
            rpcUrl: 'https://testnet.opnet.org',
            explorerUrl: 'https://testnet-explorer.opnet.org',
        },
    ],
    [
        networks.regtest.bech32,
        {
            name: 'Regtest',
            rpcUrl: 'http://localhost:9001',
            explorerUrl: 'http://localhost:3000',
        },
    ],
]);

export function getNetworkConfig(network: Network): NetworkConfig {
    const config = NETWORK_CONFIGS.get(network.bech32);
    if (config === undefined) throw new Error(`Unsupported network: ${network.bech32}`);
    return config;
}

export function resolveRpcUrl(network: Network): string {
    return getNetworkConfig(network).rpcUrl;
}
