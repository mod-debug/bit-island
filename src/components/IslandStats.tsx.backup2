import { useState, useEffect, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { escrowService } from '../services/OTCEscrowService.js';
import { getOTCEscrowAddress } from '../config/contracts.js';
import type { OTCStats } from '../types/index.js';

interface StatItemProps {
    value: string;
    label: string;
}

function StatItem({ value, label }: StatItemProps): React.JSX.Element {
    const spanRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (spanRef.current === null) return;
        const numericVal = parseFloat(value.replace(/[^0-9.]/g, ''));
        if (isNaN(numericVal) || numericVal === 0) return;

        const duration = 1200;
        const startTime = performance.now();

        function tick(now: number): void {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(numericVal * eased);
            if (spanRef.current !== null) {
                spanRef.current.textContent = value.replace(/[0-9,]+/, current.toLocaleString());
            }
            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }, [value]);

    return (
        <div className="stat-item">
            <span ref={spanRef} className="stat-item__value">{value}</span>
            <span className="stat-item__label">{label}</span>
        </div>
    );
}

export function IslandStatsBar(): React.JSX.Element {
    const { network } = useWalletConnect();
    const [stats, setStats] = useState<OTCStats>({ activeOffers: 0, totalOffers: 0, totalVolume: 0n });

    useEffect(() => {
        if (network === null) return;
        void (async () => {
            try {
                const address = getOTCEscrowAddress(network);
                escrowService.initialize(address, network);
                const s = await escrowService.getStats();
                setStats(s);
            } catch {
                // Silently ignore — placeholder addresses not yet deployed
            }
        })();
    }, [network]);

    return (
        <section className="stats-bar" aria-label="Trading post statistics">
            <StatItem value={stats.activeOffers.toString()} label="Active Deals" />
            <StatItem value={stats.totalOffers.toString()} label="Total Deals" />
            <StatItem value="Bitcoin L1" label="Network" />
            <StatItem value="OP-20" label="Token Standard" />
            <StatItem value="Trustless" label="Escrow Type" />
        </section>
    );
}
