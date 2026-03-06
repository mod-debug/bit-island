import { useMemo, useState, useEffect } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { VestingSchedule } from '../../types/index.js';
import { vestingService } from '../../services/VestingVaultService.js';
import { formatTokenAmount } from '../../utils/tokenAmount.js';

const CHART_POINTS = 40;

interface VestingChartProps {
    readonly schedule: VestingSchedule;
    readonly currentBlock: bigint;
}

interface DataPoint {
    block: number;
    vested: number;
    claimed: number;
}

export function VestingChart({ schedule: s, currentBlock }: VestingChartProps): React.JSX.Element {
    const [decimals, setDecimals] = useState<number>(18);
    const [symbol, setSymbol] = useState<string>('');

    useEffect(() => {
        void vestingService.resolveTokenDecimals(s.token).then(setDecimals);
        void vestingService.resolveTokenSymbol(s.token).then(setSymbol);
    }, [s.token]);

    const isStepped = s.vestingType === 1 && s.stepsCount > 0;

    const data = useMemo((): DataPoint[] => {
        const start = Number(s.startBlock);
        const end = Number(s.startBlock + s.durationBlocks);
        const cliff = Number(s.cliffBlocks);
        const total = Number(s.totalAmount);
        const duration = Number(s.durationBlocks);
        const claimed = Number(s.claimedAmount);
        const divisor = 10 ** decimals;

        const points: DataPoint[] = [];

        if (isStepped) {
            // Stepped vesting: flat lines with vertical jumps at each step
            const steps = s.stepsCount;
            const stepDuration = duration / steps;
            const amountPerStep = total / steps;

            // Start at 0
            points.push({ block: start, vested: 0, claimed: claimed / divisor });

            // Before cliff: flat at 0
            if (cliff > 0) {
                points.push({ block: start + cliff - 1, vested: 0, claimed: claimed / divisor });
            }

            // Each step: jump up then flat until next step
            for (let i = 1; i <= steps; i++) {
                const stepBlock = start + Math.floor(stepDuration * i);
                const vestedAtStep = amountPerStep * i;

                // Point just before the step (still at previous level)
                if (i > 1) {
                    const prevVested = amountPerStep * (i - 1);
                    points.push({ block: stepBlock - 1, vested: prevVested / divisor, claimed: claimed / divisor });
                } else if (cliff > 0) {
                    points.push({ block: start + cliff, vested: 0, claimed: claimed / divisor });
                }

                // Point at the step (jump to new level)
                points.push({ block: stepBlock, vested: vestedAtStep / divisor, claimed: claimed / divisor });
            }

            // Ensure end point
            const lastBlock = points[points.length - 1]?.block;
            if (lastBlock !== undefined && lastBlock !== end) {
                points.push({ block: end, vested: total / divisor, claimed: claimed / divisor });
            }
        } else {
            // Linear vesting
            const step = Math.max(1, Math.floor((end - start) / CHART_POINTS));

            for (let block = start; block <= end; block += step) {
                const elapsed = block - start;
                let vested = 0;
                if (elapsed >= duration) {
                    vested = total;
                } else if (elapsed >= cliff) {
                    vested = (total * elapsed) / duration;
                }
                points.push({ block, vested: vested / divisor, claimed: claimed / divisor });
            }

            // Ensure the last point is exactly the end block
            const lastBlock = points[points.length - 1]?.block;
            if (lastBlock !== undefined && lastBlock !== end) {
                points.push({ block: end, vested: total / divisor, claimed: claimed / divisor });
            }
        }

        return points;
    }, [s.startBlock, s.durationBlocks, s.cliffBlocks, s.totalAmount, s.claimedAmount, s.stepsCount, decimals, isStepped]);

    const cliffBlock = Number(s.startBlock + s.cliffBlocks);
    const currentBlockNum = Number(currentBlock);
    const totalFormatted = formatTokenAmount(s.totalAmount, decimals);

    return (
        <div className="vest-chart">
            <div className="vest-chart__header">
                <span className="vest-chart__title">Vesting Curve</span>
                <span className="vest-chart__total">{totalFormatted} {symbol}</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                        <linearGradient id="vestGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f7931a" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#f7931a" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                        dataKey="block"
                        tick={{ fill: '#888', fontSize: 10 }}
                        tickFormatter={(v: number) => v.toLocaleString()}
                        stroke="rgba(255,255,255,0.1)"
                    />
                    <YAxis
                        tick={{ fill: '#888', fontSize: 10 }}
                        tickFormatter={(v: number) => v.toLocaleString()}
                        stroke="rgba(255,255,255,0.1)"
                        width={50}
                    />
                    <Tooltip
                        contentStyle={{
                            background: 'rgba(20, 20, 15, 0.95)',
                            border: '1px solid rgba(247, 147, 26, 0.3)',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            color: '#eee',
                        }}
                        formatter={(value: number | undefined, name: string | undefined) => [
                            `${(value ?? 0).toLocaleString()} ${symbol}`,
                            name === 'vested' ? 'Vested' : 'Claimed',
                        ]}
                        labelFormatter={(label) => `Block ${Number(label).toLocaleString()}`}
                    />
                    <Area
                        type={isStepped ? 'stepAfter' : 'monotone'}
                        dataKey="vested"
                        stroke="#f7931a"
                        strokeWidth={2}
                        fill="url(#vestGrad)"
                        animationDuration={800}
                    />
                    <Area
                        type="monotone"
                        dataKey="claimed"
                        stroke="#5b9bd5"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        fill="none"
                        animationDuration={800}
                    />
                    {s.cliffBlocks > 0n && (
                        <ReferenceLine
                            x={cliffBlock}
                            stroke="#ff4d4d"
                            strokeDasharray="3 3"
                            label={{ value: 'Cliff', fill: '#ff4d4d', fontSize: 10, position: 'top' }}
                        />
                    )}
                    <ReferenceLine
                        x={currentBlockNum}
                        stroke="#3ddc5c"
                        strokeWidth={2}
                        label={{ value: 'Now', fill: '#3ddc5c', fontSize: 10, position: 'top' }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
