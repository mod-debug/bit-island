import { useState, useCallback } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { networks } from '@btc-vision/bitcoin';
import { deployToken } from '../services/TokenDeployService.js';
import { addLaunchedToken } from '../services/TokenRegistryService.js';
import type { TokenConfig, DeploymentResult } from '../types/index.js';

export interface UseLaunchReturn {
    launching: boolean;
    result: DeploymentResult | null;
    error: string | null;
    launch: (config: TokenConfig) => Promise<void>;
    reset: () => void;
}

export function useLaunch(): UseLaunchReturn {
    const { walletAddress, provider, network } = useWalletConnect();
    const [launching, setLaunching] = useState(false);
    const [result, setResult] = useState<DeploymentResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const launch = useCallback(async (config: TokenConfig): Promise<void> => {
        if (walletAddress === null || walletAddress === undefined) {
            setError('Connect your wallet first.');
            return;
        }
        if (provider === null || provider === undefined) {
            setError('Provider not ready. Try reconnecting your wallet.');
            return;
        }

        setLaunching(true);
        setError(null);
        setResult(null);

        const activeNetwork = network ?? networks.opnetTestnet;

        try {
            const deployment = await deployToken(
                config.name,
                config.symbol,
                config.decimals,
                config.maxSupply,
                walletAddress,
                provider,
                activeNetwork,
            );

            setResult(deployment);

            addLaunchedToken({
                id: `${config.symbol}-${Date.now()}`,
                name: config.name,
                symbol: config.symbol,
                decimals: config.decimals,
                maxSupply: config.maxSupply,
                contractAddress: deployment.contractAddress,
                deployTxId: deployment.deployTxId,
                creator: walletAddress,
                createdAt: Date.now(),
                description: config.description,
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Launch failed. Try again.';
            setError(msg);
        } finally {
            setLaunching(false);
        }
    }, [walletAddress, provider, network]);

    const reset = useCallback(() => {
        setResult(null);
        setError(null);
    }, []);

    return { launching, result, error, launch, reset };
}
