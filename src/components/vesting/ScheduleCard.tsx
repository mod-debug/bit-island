import { useState, useEffect } from 'react';
import { SCHEDULE_STATUS, type VestingSchedule } from '../../types/index.js';
import { vestingService } from '../../services/VestingVaultService.js';
import { formatTokenAmount } from '../../utils/tokenAmount.js';
import { useCountdown } from '../../hooks/useCountdown.js';

interface ScheduleCardProps {
    readonly schedule: VestingSchedule;
    readonly walletAddress: string | null;
    readonly onClaim: (s: VestingSchedule) => void;
    readonly onRevoke: (s: VestingSchedule) => void;
    readonly onTransfer: (s: VestingSchedule) => void;
    readonly onDetails: (s: VestingSchedule) => void;
    readonly claiming: bigint | null;
    readonly revoking: bigint | null;
    readonly transferring: bigint | null;
    readonly currentBlock: bigint;
    readonly recentlyClaimed: Set<string>;
}

function statusLabel(status: number): string {
    switch (status) {
        case SCHEDULE_STATUS.ACTIVE: return 'Active';
        case SCHEDULE_STATUS.REVOKED: return 'Revoked';
        case SCHEDULE_STATUS.FULLY_VESTED: return 'Fully Vested';
        case SCHEDULE_STATUS.CLIFF_PENDING: return 'Cliff Pending';
        default: return 'Unknown';
    }
}

function statusClass(status: number): string {
    switch (status) {
        case SCHEDULE_STATUS.ACTIVE: return 'vest-status--active';
        case SCHEDULE_STATUS.REVOKED: return 'vest-status--revoked';
        case SCHEDULE_STATUS.FULLY_VESTED: return 'vest-status--vested';
        case SCHEDULE_STATUS.CLIFF_PENDING: return 'vest-status--cliff';
        default: return '';
    }
}

function shortAddr(addr: string): string {
    if (addr.length <= 16) return addr;
    return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function blocksToApproxDays(blocks: bigint): string {
    const days = Number(blocks) / 144;
    if (days < 1) return `~${Math.round(days * 24)}h`;
    if (days < 30) return `~${Math.round(days)}d`;
    if (days < 365) return `~${Math.round(days / 30)}mo`;
    return `~${(days / 365).toFixed(1)}y`;
}

function blocksToCountdown(blocks: bigint): string {
    const totalMinutes = Number(blocks) * 10; // ~10 min per block
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const mins = Math.round(totalMinutes % 60);
    if (days > 0) return `~${days}d ${hours}h`;
    if (hours > 0) return `~${hours}h ${mins}m`;
    if (mins > 0) return `~${mins}m`;
    return '< 1m';
}

/** Compute blocks until next meaningful unlock for a beneficiary */
function computeNextClaimBlocks(s: VestingSchedule, currentBlock: bigint): { blocks: bigint; reason: string } | null {
    if (s.revoked) return null;

    const cliffBlock = s.startBlock + s.cliffBlocks;
    const endBlock = s.startBlock + s.durationBlocks;

    // Fully vested + all claimed
    if (currentBlock >= endBlock && s.claimedAmount >= s.totalAmount) return null;

    // Cliff pending
    if (currentBlock < cliffBlock) {
        const remaining = cliffBlock - currentBlock;
        return { blocks: remaining, reason: 'Cliff ends' };
    }

    // Fully vested but not all claimed yet → can claim now
    if (currentBlock >= endBlock) return null;

    // Stepped vesting: next step unlock
    if (s.vestingType === 1 && s.stepsCount > 0) {
        const elapsed = currentBlock - s.startBlock;
        const stepDuration = s.durationBlocks / BigInt(s.stepsCount);
        if (stepDuration > 0n) {
            const completedSteps = elapsed / stepDuration;
            const nextStep = completedSteps + 1n;
            if (nextStep <= BigInt(s.stepsCount)) {
                const nextStepBlock = s.startBlock + nextStep * stepDuration;
                const remaining = nextStepBlock - currentBlock;
                if (remaining > 0n) {
                    return { blocks: remaining, reason: `Step ${nextStep.toString()}/${s.stepsCount}` };
                }
            }
        }
        return null;
    }

    // Linear: tokens vest continuously — no specific "next" event
    return null;
}

function getMilestone(percent: number): { label: string; emoji: string } | null {
    if (percent >= 100) return { label: 'Fully Vested!', emoji: '\uD83C\uDF89' };
    if (percent >= 75) return { label: '75%', emoji: '\uD83D\uDD25' };
    if (percent >= 50) return { label: 'Halfway!', emoji: '\u26A1' };
    if (percent >= 25) return { label: '25%', emoji: '\uD83C\uDF31' };
    return null;
}

function ShareCardBtn({ scheduleId }: { readonly scheduleId: bigint }): React.JSX.Element {
    const [copied, setCopied] = useState(false);
    const handleShare = (): void => {
        const url = `${window.location.origin}/vault?view=${scheduleId.toString()}`;
        void navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button className="btn btn--ghost btn--xs vest-card__share-btn" onClick={handleShare} title="Copy share link">
            {copied ? 'Copied!' : 'Share'}
        </button>
    );
}

/** Determine countdown type for CSS coloring */
type CountdownType = 'cliff' | 'step' | 'full' | 'ready';

function getCountdownType(s: VestingSchedule, currentBlock: bigint): CountdownType {
    const cliffBlock = s.startBlock + s.cliffBlocks;
    if (currentBlock < cliffBlock) return 'cliff';
    const endBlock = s.startBlock + s.durationBlocks;
    if (currentBlock >= endBlock) return 'ready';
    if (s.vestingType === 1 && s.stepsCount > 0) return 'step';
    return 'full';
}

function getCountdownBlocks(s: VestingSchedule, currentBlock: bigint): bigint {
    const cliffBlock = s.startBlock + s.cliffBlocks;
    if (currentBlock < cliffBlock) return cliffBlock - currentBlock;

    const endBlock = s.startBlock + s.durationBlocks;
    if (currentBlock >= endBlock) return 0n;

    if (s.vestingType === 1 && s.stepsCount > 0) {
        const elapsed = currentBlock - s.startBlock;
        const stepDuration = s.durationBlocks / BigInt(s.stepsCount);
        if (stepDuration > 0n) {
            const completedSteps = elapsed / stepDuration;
            const nextStep = completedSteps + 1n;
            if (nextStep <= BigInt(s.stepsCount)) {
                const nextStepBlock = s.startBlock + nextStep * stepDuration;
                if (nextStepBlock > currentBlock) return nextStepBlock - currentBlock;
            }
        }
    }

    return endBlock - currentBlock;
}

function LiveCountdown({
    schedule,
    currentBlock,
}: {
    readonly schedule: VestingSchedule;
    readonly currentBlock: bigint;
}): React.JSX.Element | null {
    const blocksRemaining = getCountdownBlocks(schedule, currentBlock);
    const cdType = getCountdownType(schedule, currentBlock);
    const { display, isExpired } = useCountdown(blocksRemaining, currentBlock);

    if (schedule.revoked) return null;
    if (schedule.claimedAmount >= schedule.totalAmount && schedule.progressPercent >= 100) return null;

    const label = cdType === 'cliff' ? 'Cliff unlock'
        : cdType === 'step' ? 'Next step'
        : cdType === 'ready' ? '' : 'Fully vested';

    return (
        <div className={`vest-card__live-countdown vest-card__live-countdown--${isExpired ? 'ready' : cdType}`}>
            {isExpired ? (
                <span className="vest-card__live-countdown-ready">Ready to claim!</span>
            ) : (
                <>
                    <span className="vest-card__live-countdown-label">{label} in</span>
                    <span className="vest-card__live-countdown-timer">{display}</span>
                </>
            )}
        </div>
    );
}

function CopyBtn({ text }: { readonly text: string }): React.JSX.Element {
    const [copied, setCopied] = useState(false);
    const handleCopy = (): void => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button className="vest-copy-btn" onClick={handleCopy} title="Copy address">
            {copied ? '\u2713' : '\u2398'}
        </button>
    );
}

export function ScheduleCard({
    schedule: s,
    walletAddress,
    onClaim,
    onRevoke,
    onTransfer,
    onDetails,
    claiming,
    revoking,
    transferring,
    currentBlock,
    recentlyClaimed,
}: ScheduleCardProps): React.JSX.Element {
    const [tokenSymbol, setTokenSymbol] = useState<string>('…');
    const [decimals, setDecimals] = useState<number>(18);

    useEffect(() => {
        void vestingService.resolveTokenSymbol(s.token).then(setTokenSymbol);
        void vestingService.resolveTokenDecimals(s.token).then(setDecimals);
    }, [s.token]);

    const isBeneficiary = walletAddress !== null && s.beneficiary.toLowerCase() === walletAddress.toLowerCase();
    const isCreator = walletAddress !== null && s.creator.toLowerCase() === walletAddress.toLowerCase();
    const canClaim = isBeneficiary && s.claimableAmount > 0n && !s.revoked;
    const canRevoke = isCreator && s.revocable && !s.revoked && s.status !== SCHEDULE_STATUS.FULLY_VESTED;
    const canTransfer = isBeneficiary && !s.revoked && s.claimedAmount < s.totalAmount;
    const isClaiming = claiming === s.id;
    const isRevoking = revoking === s.id;
    const isTransferring = transferring === s.id;
    const alreadyClaimed = recentlyClaimed.has(s.id.toString());
    const claimDisabled = isClaiming || alreadyClaimed;

    const endBlock = s.startBlock + s.durationBlocks;
    const cliffBlock = s.startBlock + s.cliffBlocks;
    const elapsed = currentBlock > s.startBlock ? currentBlock - s.startBlock : 0n;

    // Timeline marker positions (%)
    const hasCliff = s.cliffBlocks > 0n;
    const cliffPercent = s.durationBlocks > 0n
        ? (Number(s.cliffBlocks) / Number(s.durationBlocks)) * 100
        : 0;
    const currentPercent = s.durationBlocks > 0n
        ? Math.min(100, (Number(elapsed) / Number(s.durationBlocks)) * 100)
        : 0;
    const vestedPercent = Math.min(s.progressPercent, 100);
    const claimedPercent = s.totalAmount > 0n
        ? (Number(s.claimedAmount) / Number(s.totalAmount)) * 100
        : 0;
    const claimablePercent = s.totalAmount > 0n
        ? (Number(s.claimableAmount) / Number(s.totalAmount)) * 100
        : 0;

    // Countdown
    const isCliffPending = s.status === SCHEDULE_STATUS.CLIFF_PENDING;
    const isActive = s.status === SCHEDULE_STATUS.ACTIVE;
    const remainingToCliff = cliffBlock > currentBlock ? cliffBlock - currentBlock : 0n;
    const remainingToEnd = endBlock > currentBlock ? endBlock - currentBlock : 0n;

    // Milestone
    const milestone = !s.revoked ? getMilestone(s.progressPercent) : null;

    // Next claim info for beneficiaries
    const nextClaim = isBeneficiary ? computeNextClaimBlocks(s, currentBlock) : null;

    return (
        <div className={`vest-card ${canClaim ? 'vest-card--claimable' : isBeneficiary ? 'vest-card--beneficiary' : isCreator ? 'vest-card--creator' : ''} ${s.revoked ? 'vest-card--revoked' : ''}`}>
            <div className="vest-card__header">
                <div className="vest-card__token">
                    <span className="vest-card__token-icon">&#127820;</span>
                    <span className="vest-card__token-name">{tokenSymbol}</span>
                    <span className="vest-card__id">#{s.id.toString()}</span>
                </div>
                <div className="vest-card__header-right">
                    {milestone !== null && (
                        <span className="vest-card__milestone">
                            {milestone.emoji} {milestone.label}
                        </span>
                    )}
                    <span className={`vest-card__status ${statusClass(s.status)}`}>
                        {statusLabel(s.status)}
                    </span>
                    <ShareCardBtn scheduleId={s.id} />
                    <button
                        className="btn btn--ghost btn--xs vest-card__details-btn"
                        onClick={() => onDetails(s)}
                    >
                        Details
                    </button>
                </div>
            </div>

            {/* Progress bar */}
            <div className="vest-card__progress-wrap">
                <div className="vest-card__progress-bar">
                    {hasCliff && (
                        <div
                            className="vest-card__cliff-zone"
                            style={{ width: `${Math.max(cliffPercent, 1)}%` }}
                        />
                    )}
                    {isBeneficiary ? (
                        <>
                            {/* Blue bar = claimed (beneficiary only) */}
                            {claimedPercent > 0 && (
                                <div
                                    className="vest-card__progress-claimed"
                                    style={{
                                        left: `${hasCliff ? cliffPercent : 0}%`,
                                        width: `${Math.max(0, claimedPercent)}%`,
                                    }}
                                />
                            )}
                            {/* Yellow bar = claimable (beneficiary only) */}
                            {claimablePercent > 0 && (
                                <div
                                    className="vest-card__progress-claimable"
                                    style={{
                                        left: `${Math.max(0, vestedPercent - claimablePercent)}%`,
                                        width: `${claimablePercent}%`,
                                    }}
                                />
                            )}
                        </>
                    ) : (
                        /* White bar = vested (public) */
                        vestedPercent > 0 && (
                            <div
                                className="vest-card__progress-vested"
                                style={{
                                    left: `${hasCliff ? cliffPercent : 0}%`,
                                    width: `${Math.max(0, vestedPercent - (hasCliff ? cliffPercent : 0))}%`,
                                }}
                            />
                        )
                    )}
                    {hasCliff && cliffPercent < 100 && (
                        <div
                            className="vest-card__cliff-marker"
                            style={{ left: `${Math.max(cliffPercent, 1)}%` }}
                            title={`Cliff at block ${cliffBlock.toLocaleString()}`}
                        />
                    )}
                    <div
                        className="vest-card__current-marker"
                        style={{ left: `${currentPercent}%` }}
                    />
                </div>
                <div className="vest-card__progress-info">
                    <span className="vest-card__progress-label">
                        {s.progressPercent.toFixed(1)}% vested
                    </span>
                    {isCliffPending && remainingToCliff > 0n && (
                        <span className="vest-card__countdown">
                            Cliff in {remainingToCliff.toLocaleString()} blocks ({blocksToCountdown(remainingToCliff)})
                        </span>
                    )}
                    {isActive && remainingToEnd > 0n && (
                        <span className="vest-card__countdown vest-card__countdown--blue">
                            Fully vested in {remainingToEnd.toLocaleString()} blocks ({blocksToCountdown(remainingToEnd)})
                        </span>
                    )}
                    <span className="vest-card__block-now">
                        Actual Block {currentBlock.toLocaleString()}
                    </span>
                </div>
                <LiveCountdown schedule={s} currentBlock={currentBlock} />
                {isBeneficiary && !s.revoked && (
                    <div className="vest-card__next-claim">
                        {s.claimableAmount > 0n ? (
                            <span className="vest-card__next-claim-now">
                                {formatTokenAmount(s.claimableAmount, decimals)} {tokenSymbol} claimable now
                            </span>
                        ) : nextClaim !== null ? (
                            <span className="vest-card__next-claim-info">
                                Next claim in <strong>{nextClaim.blocks.toLocaleString()} blocks</strong> ({blocksToCountdown(nextClaim.blocks)})
                                <span className="vest-card__next-claim-reason">{nextClaim.reason}</span>
                            </span>
                        ) : s.progressPercent >= 100 && s.claimedAmount >= s.totalAmount ? (
                            <span className="vest-card__next-claim-done">All tokens claimed</span>
                        ) : s.vestingType === 0 && s.status === SCHEDULE_STATUS.ACTIVE ? (
                            <span className="vest-card__next-claim-linear">Tokens vesting continuously</span>
                        ) : null}
                    </div>
                )}
                <div className="vest-card__legend">
                    {isBeneficiary ? (
                        <>
                            <span className="vest-card__legend-item">
                                <span className="vest-card__legend-dot vest-card__legend-dot--claimed" />
                                Claimed
                            </span>
                            <span className="vest-card__legend-item">
                                <span className="vest-card__legend-dot vest-card__legend-dot--claimable" />
                                Claimable
                            </span>
                        </>
                    ) : (
                        <span className="vest-card__legend-item">
                            <span className="vest-card__legend-dot vest-card__legend-dot--vested" />
                            Vested
                        </span>
                    )}
                    {hasCliff ? (
                        <span className="vest-card__legend-item">
                            <span className="vest-card__legend-dot vest-card__legend-dot--cliff" />
                            Cliff
                        </span>
                    ) : (
                        <span className="vest-card__legend-item">
                            <span className="vest-card__legend-dot vest-card__legend-dot--cliff" />
                            No cliff
                        </span>
                    )}
                    {s.status === SCHEDULE_STATUS.CLIFF_PENDING && (
                        <span className="vest-card__legend-item">
                            <span className="vest-card__legend-dot vest-card__legend-dot--cliff-pending" />
                            Cliff Period
                        </span>
                    )}
                </div>
            </div>

            {/* Amounts */}
            <div className="vest-card__amounts">
                <div className="vest-card__amount-row">
                    <span className="vest-card__amount-label">Total Locked</span>
                    <span className="vest-card__amount-value vest-card__amount-value--locked">
                        {formatTokenAmount(s.totalAmount, decimals)} {tokenSymbol}
                    </span>
                </div>
                <div className="vest-card__amount-row">
                    <span className="vest-card__amount-label">Vested</span>
                    <span className="vest-card__amount-value vest-card__amount-value--vested">
                        {formatTokenAmount(s.vestedAmount, decimals)} {tokenSymbol}
                    </span>
                </div>
                {isBeneficiary && (
                    <>
                        <div className="vest-card__amount-row">
                            <span className="vest-card__amount-label">Claimed</span>
                            <span className="vest-card__amount-value vest-card__amount-value--claimed">
                                {formatTokenAmount(s.claimedAmount, decimals)} {tokenSymbol}
                            </span>
                        </div>
                        <div className="vest-card__amount-row">
                            <span className="vest-card__amount-label">Claimable</span>
                            <span className="vest-card__amount-value vest-card__amount-value--claim">
                                {formatTokenAmount(s.claimableAmount, decimals)} {tokenSymbol}
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* Block info */}
            <div className="vest-card__blocks">
                <div className="vest-card__block-item">
                    <span className="vest-card__block-label">Start</span>
                    <span className="vest-card__block-value">{s.startBlock.toLocaleString()}</span>
                </div>
                <div className="vest-card__block-item">
                    <span className="vest-card__block-label">Cliff</span>
                    <span className="vest-card__block-value">
                        {hasCliff ? (
                            <>
                                {cliffBlock.toLocaleString()} ({blocksToApproxDays(s.cliffBlocks)})
                                <span className="vest-card__block-detail">{s.cliffBlocks.toString()} blocks</span>
                            </>
                        ) : (
                            <span className="vest-card__no-cliff">No cliff</span>
                        )}
                    </span>
                </div>
                <div className="vest-card__block-item">
                    <span className="vest-card__block-label">End</span>
                    <span className="vest-card__block-value">
                        {endBlock.toLocaleString()} ({blocksToApproxDays(s.durationBlocks)})
                        <span className="vest-card__block-detail">{s.durationBlocks.toString()} blocks</span>
                    </span>
                </div>
                {s.revocable && (
                    <div className="vest-card__block-item">
                        <span className="vest-card__block-label">Revocable</span>
                        <span className="vest-card__block-value vest-card__revocable-badge">Yes</span>
                    </div>
                )}
            </div>

            {/* Addresses */}
            <div className="vest-card__addresses">
                <div className="vest-card__addr-row">
                    <span className="vest-card__addr-label">Creator</span>
                    <span className="vest-card__addr-value">
                        {shortAddr(s.creator)}
                        <CopyBtn text={s.creator} />
                    </span>
                </div>
                <div className="vest-card__addr-row">
                    <span className="vest-card__addr-label">Beneficiary</span>
                    <span className="vest-card__addr-value">
                        {shortAddr(s.beneficiary)}
                        <CopyBtn text={s.beneficiary} />
                        {isBeneficiary && <span className="vest-card__you-badge">You</span>}
                    </span>
                </div>
            </div>

            {/* Actions */}
            {(canClaim || canRevoke || canTransfer) && (
                <div className="vest-card__actions">
                    {canClaim && (
                        <button
                            className={`btn btn--sm vest-card__claim-btn ${claimDisabled ? 'btn--ghost' : 'btn--banana-flash'}`}
                            onClick={() => onClaim(s)}
                            disabled={claimDisabled}
                        >
                            {isClaiming ? 'Claiming…' : alreadyClaimed ? 'Claimed' : `Claim ${formatTokenAmount(s.claimableAmount, decimals)} ${tokenSymbol}`}
                        </button>
                    )}
                    {canTransfer && (
                        <button
                            className="btn btn--ghost btn--sm vest-card__transfer-btn"
                            onClick={() => onTransfer(s)}
                            disabled={isTransferring}
                        >
                            {isTransferring ? 'Transferring…' : 'Transfer'}
                        </button>
                    )}
                    {canRevoke && (
                        <button
                            className="btn btn--ghost btn--sm vest-card__revoke-btn"
                            onClick={() => onRevoke(s)}
                            disabled={isRevoking}
                        >
                            {isRevoking ? 'Revoking…' : 'Revoke Schedule'}
                        </button>
                    )}
                </div>
            )}

            {/* Role indicators */}
            {(isBeneficiary || isCreator) && (
                <div className="vest-card__role-bar">
                    {isCreator && (
                        <span className="vest-card__role-tag vest-card__role-tag--creator">
                            <span className="vest-card__role-dot vest-card__role-dot--creator" />
                            Creator
                        </span>
                    )}
                    {isBeneficiary && (
                        <span className="vest-card__role-tag vest-card__role-tag--beneficiary">
                            <span className="vest-card__role-dot vest-card__role-dot--beneficiary" />
                            Beneficiary
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
