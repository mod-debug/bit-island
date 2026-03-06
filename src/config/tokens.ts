import { networks, type Network } from '@btc-vision/bitcoin';
import { resolveNetwork } from './networks.js';

/** Known OP-20 token metadata */
export interface TokenInfo {
    /** Contract address (bech32) */
    readonly address: string;
    /** Ticker symbol */
    readonly symbol: string;
    /** Full name */
    readonly name: string;
    /** Decimal places (typically 18) */
    readonly decimals: number;
    /** CSS color for UI badges */
    readonly color: string;
    /** Icon path relative to public/ (e.g. "/tokens/moto.png") */
    readonly icon?: string;
}

/**
 * Registry of known OP-20 tokens per network.
 * Keyed by network bech32 prefix.
 */
const TOKEN_REGISTRY: Map<string, TokenInfo[]> = new Map([
    [
        networks.opnetTestnet.bech32,
        [
            {
                address: 'opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds',
                symbol: 'MOTO',
                name: 'MotoSwap Token',
                decimals: 18,
                color: '#f7931a',
                icon: '/tokens/moto.png',
            },
            {
                address: 'opt1sqp5gx9k0nrqph3sy3aeyzt673dz7ygtqxcfdqfle',
                symbol: 'PILL',
                name: 'Pill Token',
                decimals: 18,
                color: '#8b5cf6',
                icon: '/tokens/pill.jpg',
            },
        ],
    ],
    [
        networks.bitcoin.bech32,
        [],
    ],
]);

/** Get all known tokens for a network. */
export function getKnownTokens(network: Network): TokenInfo[] {
    const canonical = resolveNetwork(network);
    return TOKEN_REGISTRY.get(canonical.bech32) ?? [];
}

/** Look up a token by address. Returns undefined if not in registry. */
export function findTokenByAddress(address: string, network: Network): TokenInfo | undefined {
    const tokens = getKnownTokens(network);
    const lower = address.toLowerCase();
    return tokens.find((t) => t.address.toLowerCase() === lower);
}

/** Look up a token by symbol. Returns undefined if not in registry. */
export function findTokenBySymbol(symbol: string, network: Network): TokenInfo | undefined {
    const tokens = getKnownTokens(network);
    const upper = symbol.toUpperCase();
    return tokens.find((t) => t.symbol.toUpperCase() === upper);
}
