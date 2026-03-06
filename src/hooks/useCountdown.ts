import { useState, useEffect, useRef } from 'react';

/** Return type for the useCountdown hook */
interface CountdownResult {
    /** Formatted display string, e.g. "2d 5h 32m 10s" or "Ready to claim!" */
    readonly display: string;
    /** Whether the countdown has expired */
    readonly isExpired: boolean;
    /** Total remaining seconds (0 when expired) */
    readonly totalSeconds: number;
}

/**
 * Compute a target timestamp from remaining blocks.
 * Each Bitcoin block is ~10 minutes.
 */
function blocksToTargetMs(blocksRemaining: bigint): number {
    return Date.now() + Number(blocksRemaining) * 10 * 60 * 1000;
}

/**
 * Format total seconds into a human-readable countdown string.
 */
function formatCountdown(totalSec: number): string {
    if (totalSec <= 0) return 'Ready to claim!';

    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = Math.floor(totalSec % 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
}

/**
 * Live countdown hook that ticks every second.
 *
 * @param blocksRemaining - Number of blocks until the target event
 * @param currentBlock - Current block number (used to recalculate target when it changes)
 * @returns Countdown display, expiration state, and total remaining seconds
 */
export function useCountdown(blocksRemaining: bigint, currentBlock: bigint): CountdownResult {
    const targetRef = useRef<number>(blocksToTargetMs(blocksRemaining));

    // Recalculate target when currentBlock changes (polled every 30s)
    useEffect(() => {
        targetRef.current = blocksToTargetMs(blocksRemaining);
    }, [blocksRemaining, currentBlock]);

    const initialSeconds = Math.max(0, Number(blocksRemaining) * 10 * 60);
    const [totalSeconds, setTotalSeconds] = useState<number>(initialSeconds);

    useEffect(() => {
        const tick = (): void => {
            const remaining = Math.max(0, Math.floor((targetRef.current - Date.now()) / 1000));
            setTotalSeconds(remaining);
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => { clearInterval(id); };
    }, [blocksRemaining, currentBlock]);

    return {
        display: formatCountdown(totalSeconds),
        isExpired: totalSeconds <= 0,
        totalSeconds,
    };
}
