import { getContract, JSONRpcProvider, NativeSwapAbi } from 'opnet';
import type { INativeSwapContract } from 'opnet';
import { networks, type Network } from '@btc-vision/bitcoin';
import { resolveRpcUrl } from '../config/networks.js';

const BTC_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
const CACHE_MS = 5 * 60 * 1000; // 5 min
const LIVE_PRICE_CACHE_MS = 2 * 60 * 1000; // 2 min

/** NativeSwap contract address (hex) — handles BTC↔Token swaps */
const NATIVE_SWAP_HEX = '0x4397befe4e067390596b3c296e77fe86589487bf3bf3f0a9a93ce794e2d78fb5';

/** Known testnet token addresses */
const KNOWN_TOKENS: readonly string[] = [
    'opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds', // MOTO
    'opt1sqp5gx9k0nrqph3sy3aeyzt673dz7ygtqxcfdqfle', // PILL
];

/** Fallback prices in BTC (used if live fetch fails) — from NativeSwap reserves 2026-03-02 */
const FALLBACK_BTC_PRICES: Record<string, number> = {
    'opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds': 0.00000204,   // MOTO
    'opt1sqp5gx9k0nrqph3sy3aeyzt673dz7ygtqxcfdqfle': 0.0000000012, // PILL
};

/** Live prices cache */
const liveBtcPrices: Record<string, number> = {};
let lastLiveFetch = 0;
let liveFetchInProgress = false;

let cachedBtcUsd: number | null = null;
let lastBtcUsdFetch = 0;

/** Fetch BTC/USD price (cached 5 min) */
export async function fetchBtcUsdPrice(): Promise<number | null> {
    const now = Date.now();
    if (cachedBtcUsd !== null && now - lastBtcUsdFetch < CACHE_MS) return cachedBtcUsd;
    try {
        const res = await fetch(BTC_PRICE_URL);
        const data = await res.json() as { bitcoin?: { usd?: number } };
        const price = data.bitcoin?.usd ?? null;
        if (price !== null) {
            cachedBtcUsd = price;
            lastBtcUsdFetch = now;
        }
        return price;
    } catch {
        return cachedBtcUsd;
    }
}

/** Get cached BTC/USD price (sync, returns last known value) */
export function getCachedBtcUsd(): number | null {
    return cachedBtcUsd;
}

/** Fetch live token BTC prices from NativeSwap reserves */
export async function fetchLiveTokenPrices(network?: Network | null): Promise<void> {
    const now = Date.now();
    if (now - lastLiveFetch < LIVE_PRICE_CACHE_MS) return;
    if (liveFetchInProgress) return;

    const net = network ?? networks.opnetTestnet;
    liveFetchInProgress = true;

    try {
        const rpcUrl = resolveRpcUrl(net);
        const provider = new JSONRpcProvider({ url: rpcUrl, network: net });

        const nativeSwap = getContract<INativeSwapContract>(
            NATIVE_SWAP_HEX,
            NativeSwapAbi,
            provider,
            net,
        ) as INativeSwapContract;

        for (const tokenAddr of KNOWN_TOKENS) {
            try {
                const tokenAddress = await provider.getPublicKeyInfo(tokenAddr, true);
                const result = await nativeSwap.getReserve(tokenAddress);
                if (result.revert !== undefined) continue;

                const vBtc = result.properties.virtualBTCReserve;
                const vToken = result.properties.virtualTokenReserve;

                if (vToken > 0n && vBtc > 0n) {
                    // virtualBTCReserve is in sats (8 decimals), virtualTokenReserve in token units (18 decimals)
                    const btcPerToken = (Number(vBtc) / 1e8) / (Number(vToken) / 1e18);
                    liveBtcPrices[tokenAddr.toLowerCase()] = btcPerToken;
                }
            } catch {
                // Skip this token, keep previous or fallback price
            }
        }

        lastLiveFetch = now;
    } catch {
        // RPC unavailable — fall back to cached/hardcoded
    } finally {
        liveFetchInProgress = false;
    }
}

/** Get token price in BTC (live > fallback) */
export function getTokenBtcPrice(tokenAddress: string): number | null {
    const key = tokenAddress.toLowerCase();
    return liveBtcPrices[key] ?? FALLBACK_BTC_PRICES[key] ?? null;
}

/** Get token price in USD */
export function getTokenUsdPrice(tokenAddress: string, btcUsd: number): number | null {
    const btcPrice = getTokenBtcPrice(tokenAddress);
    if (btcPrice === null) return null;
    return btcPrice * btcUsd;
}

/** Format USD value with K/M suffix */
export function formatUsd(value: number): string {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toFixed(6)}`;
}
