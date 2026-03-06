import { networks, type Network } from '@btc-vision/bitcoin';
import { resolveNetwork } from './networks.js';

/** Known NFT collection metadata */
export interface NftCollectionInfo {
    /** Contract address (bech32) */
    readonly address: string;
    /** Collection name */
    readonly name: string;
    /** Ticker symbol */
    readonly symbol: string;
    /** CSS color for UI badges */
    readonly color: string;
}

/**
 * Registry of known NFT collections per network.
 * Keyed by network bech32 prefix.
 */
const NFT_COLLECTION_REGISTRY: Map<string, NftCollectionInfo[]> = new Map([
    [
        networks.opnetTestnet.bech32,
        [
            {
                address: 'opt1sqrumw78eg009xm0xq7y5hj447ck9rxj98s2pp70a',
                name: 'No Smile',
                symbol: 'NOSML',
                color: '#e74c3c',
            },
            {
                address: 'opt1sqrfj652ypgrvl7khnrhgcan6gnn4esftd5q3dcux',
                name: 'BitGlyphs',
                symbol: 'GLYPH',
                color: '#9b59b6',
            },
        ],
    ],
    [
        networks.bitcoin.bech32,
        [],
    ],
]);

/** Get all known NFT collections for a network. */
export function getKnownCollections(network: Network): NftCollectionInfo[] {
    const canonical = resolveNetwork(network);
    return NFT_COLLECTION_REGISTRY.get(canonical.bech32) ?? [];
}

/** Look up a collection by address. Returns undefined if not in registry. */
export function findCollectionByAddress(address: string, network: Network): NftCollectionInfo | undefined {
    const collections = getKnownCollections(network);
    const lower = address.toLowerCase();
    return collections.find((c) => c.address.toLowerCase() === lower);
}

/** Look up a collection by symbol. Returns undefined if not in registry. */
export function findCollectionBySymbol(symbol: string, network: Network): NftCollectionInfo | undefined {
    const collections = getKnownCollections(network);
    const upper = symbol.toUpperCase();
    return collections.find((c) => c.symbol.toUpperCase() === upper);
}
