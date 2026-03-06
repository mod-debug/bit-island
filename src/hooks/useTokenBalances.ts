import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { getContract, JSONRpcProvider, OP_20_ABI } from 'opnet';
import type { IOP20Contract } from 'opnet';
import { getKnownTokens, type TokenInfo } from '../config/tokens.js';
import { resolveRpcUrl } from '../config/networks.js';

/** A single token balance entry. */
export interface TokenBalance {
    readonly token: TokenInfo;
    readonly balance: bigint;
}

/**
 * Fetches OP-20 balances for all known tokens on the connected wallet.
 * Balances are loaded once on mount and can be refreshed manually.
 */
export function useTokenBalances(): {
    balances: TokenBalance[];
    loading: boolean;
    refresh: () => Promise<void>;
} {
    const { walletAddress, address, network } = useWalletConnect();
    const [balances, setBalances] = useState<TokenBalance[]>([]);
    const [loading, setLoading] = useState(false);

    const rpc = useMemo(() => {
        if (network === null) return null;
        return new JSONRpcProvider({ url: resolveRpcUrl(network), network });
    }, [network]);

    const fetchBalances = useCallback(async () => {
        if (walletAddress === null || walletAddress === undefined || network === null || rpc === null || address === null) {
            setBalances([]);
            return;
        }

        const tokens = getKnownTokens(network);
        if (tokens.length === 0) {
            setBalances([]);
            return;
        }

        setLoading(true);
        try {
            const results = await Promise.all(
                tokens.map(async (token): Promise<TokenBalance> => {
                    try {
                        const contract = getContract<IOP20Contract>(
                            token.address,
                            OP_20_ABI,
                            rpc,
                            network,
                        ) as IOP20Contract;
                        const result = await contract.balanceOf(address);
                        if (result.revert !== undefined) {
                            return { token, balance: 0n };
                        }
                        return { token, balance: result.properties.balance };
                    } catch {
                        return { token, balance: 0n };
                    }
                }),
            );
            setBalances(results);
        } finally {
            setLoading(false);
        }
    }, [walletAddress, address, network, rpc]);

    useEffect(() => {
        void fetchBalances();
    }, [fetchBalances]);

    return { balances, loading, refresh: fetchBalances };
}
