import { useState, useEffect, useMemo } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import type { VestingStats as VestingStatsType } from '../../types/index.js';
import { formatTokenAmount } from '../../utils/tokenAmount.js';
import { fetchBtcUsdPrice, fetchLiveTokenPrices, getTokenBtcPrice, formatUsd } from '../../utils/tokenPrices.js';

interface VestingStatsProps {
    readonly stats: VestingStatsType;
    readonly currentBlock: bigint;
    readonly loading: boolean;
}

export function VestingStatsBar({ stats, currentBlock, loading }: VestingStatsProps): React.JSX.Element {
    const { network } = useWalletConnect();
    const [btcUsd, setBtcUsd] = useState<number | null>(null);
    const [tokenPriceMap, setTokenPriceMap] = useState<Record<string, number>>({});

    useEffect(() => {
        void fetchBtcUsdPrice().then((p) => {
            if (p !== null) setBtcUsd(p);
        });
        void fetchLiveTokenPrices(network).then(() => {
            // Snapshot live prices into state to trigger recalc
            const map: Record<string, number> = {};
            for (const entry of stats.tvlByToken) {
                const p = getTokenBtcPrice(entry.token);
                if (p !== null) map[entry.token.toLowerCase()] = p;
            }
            setTokenPriceMap(map);
        });
    }, [network, stats.tvlByToken]);

    // Calculate TVL in USD: for each token, amount * tokenBtcPrice * btcUsd
    const tvlUsd = useMemo((): number | null => {
        if (btcUsd === null || stats.tvlByToken.length === 0) return null;
        let total = 0;
        for (const entry of stats.tvlByToken) {
            const btcPrice = tokenPriceMap[entry.token.toLowerCase()];
            if (btcPrice === undefined) continue;
            const tokenAmount = Number(entry.amount) / 1e18; // 18 decimals
            total += tokenAmount * btcPrice * btcUsd;
        }
        return total > 0 ? total : null;
    }, [btcUsd, stats.tvlByToken, tokenPriceMap]);

    // Also show total in BTC
    const tvlBtc = useMemo((): number | null => {
        if (stats.tvlByToken.length === 0) return null;
        let total = 0;
        for (const entry of stats.tvlByToken) {
            const btcPrice = tokenPriceMap[entry.token.toLowerCase()];
            if (btcPrice === undefined) continue;
            const tokenAmount = Number(entry.amount) / 1e18;
            total += tokenAmount * btcPrice;
        }
        return total > 0 ? total : null;
    }, [stats.tvlByToken, tokenPriceMap]);

    const tvlDisplay = tvlBtc !== null
        ? `${tvlBtc.toFixed(6)} BTC`
        : formatTokenAmount(stats.totalValueLocked, 18);

    return (
        <div className="vault-stats-bar">
            <div className="vault-stats-bar__card">
                <span className="vault-stats-bar__value">{loading ? '...' : stats.activeSchedules}</span>
                <span className="vault-stats-bar__label">Active</span>
            </div>
            <div className="vault-stats-bar__card">
                <span className="vault-stats-bar__value">{loading ? '...' : stats.totalSchedules}</span>
                <span className="vault-stats-bar__label">Total Schedules</span>
            </div>
            <div className="vault-stats-bar__card vault-stats-bar__card--accent">
                <span className="vault-stats-bar__value">
                    {loading ? '...' : tvlDisplay}
                </span>
                {tvlUsd !== null && !loading && (
                    <span className="vault-stats-bar__usd">{formatUsd(tvlUsd)}</span>
                )}
                <span className="vault-stats-bar__label">TVL</span>
            </div>
            <div className="vault-stats-bar__card">
                <span className="vault-stats-bar__value">{loading ? '...' : stats.totalClaimed}</span>
                <span className="vault-stats-bar__label">Fully Claimed</span>
            </div>
            <div className="vault-stats-bar__card">
                <span className="vault-stats-bar__value">{loading ? '...' : currentBlock.toLocaleString()}</span>
                <span className="vault-stats-bar__label">Current Block</span>
            </div>
        </div>
    );
}
