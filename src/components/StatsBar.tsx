import { useEffect, useRef } from 'react';
import type { CollectionStats } from '../types/index.js';

interface StatItemProps {
    value: string;
    label: string;
    loading: boolean;
}

function StatItem({ value, label, loading }: StatItemProps): React.JSX.Element {
    const spanRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (loading || spanRef.current === null) return;
        const numericVal = parseFloat(value.replace(/[^0-9.]/g, ''));
        if (isNaN(numericVal)) return;

        let start = 0;
        const duration = 1200;
        const startTime = performance.now();

        function tick(now: number): void {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (numericVal - start) * eased);
            if (spanRef.current !== null) {
                spanRef.current.textContent = value.replace(/[0-9,]+/, current.toLocaleString());
            }
            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }, [value, loading]);

    return (
        <div className="stat-item">
            <span ref={spanRef} className="stat-item__value">
                {loading ? '—' : value}
            </span>
            <span className="stat-item__label">{label}</span>
        </div>
    );
}

interface StatsBarProps {
    stats: CollectionStats | null;
    loading: boolean;
}

export function StatsBar({ stats, loading }: StatsBarProps): React.JSX.Element {
    const minted = stats !== null ? Number(stats.totalMinted) : 0;
    const max = stats !== null ? Number(stats.maxSupply) : 4200;
    const priceInBtc = stats !== null
        ? (Number(stats.mintPrice) / 100_000_000).toFixed(5)
        : '0.00050';
    const pct = max > 0 ? Math.round((minted / max) * 100) : 0;

    return (
        <section className="stats-bar" aria-label="Collection stats">
            <StatItem value={`${minted.toLocaleString()} / ${max.toLocaleString()}`} label="Minted" loading={loading} />
            <StatItem value={`${pct}%`} label="Sold Out" loading={loading} />
            <StatItem value={`${priceInBtc} BTC`} label="Mint Price" loading={loading} />
            <StatItem value="4,200" label="Total Supply" loading={loading} />
            <StatItem value="Bitcoin L1" label="Network" loading={false} />
        </section>
    );
}
