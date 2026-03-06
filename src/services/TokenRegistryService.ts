import type { LaunchedToken, IslandStats } from '../types/index.js';

const STORAGE_KEY = 'monkey_island_tokens';

/** The official BTC Monkey token — pre-loaded on the island */
export const BTCMONKEY_TOKEN: LaunchedToken = {
    id: 'btcmonkey-official',
    name: 'BTC Monkey',
    symbol: 'MONK',
    decimals: 8,
    maxSupply: 21_000_000n * 100_000_000n,
    contractAddress: 'DEPLOY_ADDRESS_HERE',
    deployTxId: '',
    creator: 'Monkey Island',
    createdAt: Date.now(),
    description: 'The official token of Monkey Island. First token ever launched on Bitcoin L1 via OPNet.',
};

function loadTokens(): LaunchedToken[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        const parsed = JSON.parse(raw) as unknown[];
        return parsed.map((t) => {
            const token = t as Record<string, unknown>;
            return {
                ...token,
                maxSupply: BigInt(token['maxSupply'] as string),
            } as LaunchedToken;
        });
    } catch {
        return [];
    }
}

function saveTokens(tokens: LaunchedToken[]): void {
    const serializable = tokens.map((t) => ({
        ...t,
        maxSupply: t.maxSupply.toString(),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

export function addLaunchedToken(token: LaunchedToken): void {
    const existing = loadTokens();
    existing.unshift(token);
    saveTokens(existing);
}

export function getAllTokens(): LaunchedToken[] {
    return loadTokens();
}

export function getIslandStats(): IslandStats {
    const tokens = loadTokens();
    const creators = new Set(tokens.map((t) => t.creator));
    return {
        totalTokens: tokens.length + 1, // +1 for $MONK
        totalCreators: creators.size + 1,
        latestToken: tokens[0]?.symbol ?? null,
    };
}
