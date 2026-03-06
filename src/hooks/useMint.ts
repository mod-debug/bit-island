import { useState, useEffect, useCallback } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { networks } from '@btc-vision/bitcoin';
import { nftService } from '../services/NFTService.js';
import { getNFTAddress } from '../config/contracts.js';
import type { CollectionStats, MintResult } from '../types/index.js';

export interface UseMintReturn {
    stats: CollectionStats | null;
    loading: boolean;
    minting: boolean;
    error: string | null;
    mint: () => Promise<void>;
    refresh: () => Promise<void>;
}

const DEFAULT_STATS: CollectionStats = {
    totalMinted: 0n,
    maxSupply: 4200n,
    mintPrice: 50000n,
    ownerBalance: 0n,
};

export function useMint(): UseMintReturn {
    const { provider, walletAddress, network } = useWalletConnect();

    const [stats, setStats] = useState<CollectionStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [minting, setMinting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const activeNetwork = network ?? networks.opnetTestnet;

    const initializeService = useCallback(() => {
        if (provider === null || provider === undefined) return;
        try {
            const contractAddress = getNFTAddress(activeNetwork);
            nftService.initialize(contractAddress, activeNetwork);
        } catch {
            // Contract not deployed yet — use demo mode
        }
    }, [provider, activeNetwork]);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            initializeService();
            const result = await nftService.getStats(walletAddress ?? undefined);
            setStats(result);
        } catch {
            // Demo mode — show placeholder stats
            setStats(DEFAULT_STATS);
        } finally {
            setLoading(false);
        }
    }, [initializeService, walletAddress]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const mint = useCallback(async (): Promise<void> => {
        if (walletAddress === null || walletAddress === undefined) {
            setError('Please connect your wallet first.');
            return;
        }

        setMinting(true);
        setError(null);

        try {
            initializeService();
            const result: MintResult = await nftService.mint({
                signer: null,
                mldsaSigner: null,
            } as Parameters<typeof nftService.mint>[0]);

            setError(null);
            console.info(`Minted token #${result.tokenId.toString()} — tx: ${result.txId}`);
            await refresh();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Mint failed. Try again.';
            setError(message);
        } finally {
            setMinting(false);
        }
    }, [walletAddress, initializeService, refresh]);

    return { stats, loading, minting, error, mint, refresh };
}
