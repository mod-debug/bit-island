import { useEffect, useState, useCallback } from 'react';
import { SCHEDULE_STATUS, type VestingSchedule } from '../../types/index.js';
import { vestingService } from '../../services/VestingVaultService.js';
import { formatTokenAmount } from '../../utils/tokenAmount.js';
import { VestingChart } from './VestingChart.js';

interface ScheduleDetailsModalProps {
    readonly schedule: VestingSchedule;
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly currentBlock: bigint;
    readonly walletAddress: string | null;
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

function blocksToApproxTime(blocks: bigint): string {
    const totalMinutes = Number(blocks) * 10;
    const hours = Math.floor(totalMinutes / 60);
    const days = Math.floor(hours / 24);
    if (days >= 365) return `~${(days / 365).toFixed(1)} years`;
    if (days >= 30) return `~${Math.round(days / 30)} months`;
    if (days >= 1) return `~${days} days`;
    if (hours >= 1) return `~${hours} hours`;
    return `~${totalMinutes} min`;
}

function CopyButton({ text }: { readonly text: string }): React.JSX.Element {
    const [copied, setCopied] = useState(false);
    const handleCopy = (): void => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button className="vest-modal__copy-btn" onClick={handleCopy} title="Copy to clipboard">
            {copied ? '✓' : '⧉'}
        </button>
    );
}

function ShareButton({ scheduleId }: { readonly scheduleId: bigint }): React.JSX.Element {
    const [copied, setCopied] = useState(false);
    const handleShare = (): void => {
        const url = `${window.location.origin}/vault?view=${scheduleId.toString()}`;
        void navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button className="vest-modal__share-btn" onClick={handleShare} title="Copy share link">
            {copied ? 'Copied!' : 'Share'}
        </button>
    );
}

export function ScheduleDetailsModal({
    schedule: s,
    isOpen,
    onClose,
    currentBlock,
    walletAddress,
}: ScheduleDetailsModalProps): React.JSX.Element | null {
    const [tokenSymbol, setTokenSymbol] = useState<string>('...');
    const [decimals, setDecimals] = useState<number>(18);

    useEffect(() => {
        void vestingService.resolveTokenSymbol(s.token).then(setTokenSymbol);
        void vestingService.resolveTokenDecimals(s.token).then(setDecimals);
    }, [s.token]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    const endBlock = s.startBlock + s.durationBlocks;
    const cliffBlock = s.startBlock + s.cliffBlocks;
    const elapsed = currentBlock > s.startBlock ? currentBlock - s.startBlock : 0n;
    const remaining = endBlock > currentBlock ? endBlock - currentBlock : 0n;
    const unvested = s.totalAmount - s.vestedAmount;

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

    const isBeneficiary = walletAddress !== null && s.beneficiary.toLowerCase() === walletAddress.toLowerCase();
    const isCreator = walletAddress !== null && s.creator.toLowerCase() === walletAddress.toLowerCase();

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>): void => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div className="vest-modal-overlay" onClick={handleOverlayClick}>
            <div className="vest-modal" role="dialog" aria-modal="true">
                {/* Header */}
                <div className="vest-modal__header">
                    <div className="vest-modal__title-row">
                        <span className="vest-modal__token-icon">&#127820;</span>
                        <span className="vest-modal__token-name">{tokenSymbol}</span>
                        <span className="vest-modal__id">#{s.id.toString()}</span>
                        <span className={`vest-card__status ${statusClass(s.status)}`}>
                            {statusLabel(s.status)}
                        </span>
                    </div>
                    <div className="vest-modal__header-actions">
                        <ShareButton scheduleId={s.id} />
                        <button className="vest-modal__close" onClick={onClose} aria-label="Close">
                            &#10005;
                        </button>
                    </div>
                </div>

                {/* Vesting Curve Chart */}
                <div className="vest-modal__section">
                    <VestingChart schedule={s} currentBlock={currentBlock} />
                </div>

                {/* Progress */}
                <div className="vest-modal__section">
                    <h3 className="vest-modal__section-title">Progression</h3>
                    <div className="vest-card__progress-bar" style={{ height: '12px', borderRadius: '6px' }}>
                        {hasCliff && (
                            <div className="vest-card__cliff-zone" style={{ width: `${Math.max(cliffPercent, 1)}%` }} />
                        )}
                        {isBeneficiary ? (
                            <>
                                {claimedPercent > 0 && (
                                    <div
                                        className="vest-card__progress-claimed"
                                        style={{
                                            left: `${hasCliff ? cliffPercent : 0}%`,
                                            width: `${Math.max(0, claimedPercent)}%`,
                                        }}
                                    />
                                )}
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
                            <div className="vest-card__cliff-marker" style={{ left: `${Math.max(cliffPercent, 1)}%` }} />
                        )}
                        <div className="vest-card__current-marker" style={{ left: `${currentPercent}%` }} />
                    </div>
                    <div className="vest-modal__progress-label">
                        {s.progressPercent.toFixed(2)}% vested
                    </div>
                </div>

                {/* Amounts */}
                <div className="vest-modal__section">
                    <h3 className="vest-modal__section-title">Amounts</h3>
                    <div className="vest-modal__grid">
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Total Locked</span>
                            <span className="vest-modal__value">{formatTokenAmount(s.totalAmount, decimals)} {tokenSymbol}</span>
                        </div>
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Vested</span>
                            <span className="vest-modal__value vest-modal__value--green">{formatTokenAmount(s.vestedAmount, decimals)} {tokenSymbol}</span>
                        </div>
                        {isBeneficiary && (
                            <>
                                <div className="vest-modal__row">
                                    <span className="vest-modal__label">Claimed</span>
                                    <span className="vest-modal__value">{formatTokenAmount(s.claimedAmount, decimals)} {tokenSymbol}</span>
                                </div>
                                <div className="vest-modal__row">
                                    <span className="vest-modal__label">Claimable Now</span>
                                    <span className="vest-modal__value vest-modal__value--gold">
                                        {formatTokenAmount(s.claimableAmount, decimals)} {tokenSymbol}
                                    </span>
                                </div>
                            </>
                        )}
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Remaining (unvested)</span>
                            <span className="vest-modal__value">{formatTokenAmount(unvested, decimals)} {tokenSymbol}</span>
                        </div>
                    </div>
                </div>

                {/* Timeline */}
                <div className="vest-modal__section">
                    <h3 className="vest-modal__section-title">Timeline (blocks)</h3>
                    <div className="vest-modal__grid">
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Start Block</span>
                            <span className="vest-modal__value">{s.startBlock.toLocaleString()}</span>
                        </div>
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Cliff Block</span>
                            <span className="vest-modal__value">
                                {cliffBlock.toLocaleString()}
                                <span className="vest-modal__sub">({blocksToApproxTime(s.cliffBlocks)})</span>
                            </span>
                        </div>
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">End Block</span>
                            <span className="vest-modal__value">
                                {endBlock.toLocaleString()}
                                <span className="vest-modal__sub">({blocksToApproxTime(s.durationBlocks)})</span>
                            </span>
                        </div>
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Current Block</span>
                            <span className="vest-modal__value">{currentBlock.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Durations */}
                <div className="vest-modal__section">
                    <h3 className="vest-modal__section-title">Durations</h3>
                    <div className="vest-modal__grid">
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Total Duration</span>
                            <span className="vest-modal__value">
                                {s.durationBlocks.toLocaleString()} blocks
                                <span className="vest-modal__sub">({blocksToApproxTime(s.durationBlocks)})</span>
                            </span>
                        </div>
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Elapsed</span>
                            <span className="vest-modal__value">
                                {elapsed.toLocaleString()} blocks
                                <span className="vest-modal__sub">({blocksToApproxTime(elapsed)})</span>
                            </span>
                        </div>
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Remaining</span>
                            <span className="vest-modal__value">
                                {remaining.toLocaleString()} blocks
                                <span className="vest-modal__sub">({blocksToApproxTime(remaining)})</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Addresses */}
                <div className="vest-modal__section">
                    <h3 className="vest-modal__section-title">Addresses</h3>
                    <div className="vest-modal__addr-block">
                        <div className="vest-modal__addr-item">
                            <span className="vest-modal__label">
                                Creator
                                {isCreator && <span className="vest-card__you-badge">You</span>}
                            </span>
                            <div className="vest-modal__addr-line">
                                <code className="vest-modal__addr-code">{s.creator}</code>
                                <CopyButton text={s.creator} />
                            </div>
                        </div>
                        <div className="vest-modal__addr-item">
                            <span className="vest-modal__label">
                                Beneficiary
                                {isBeneficiary && <span className="vest-card__you-badge">You</span>}
                            </span>
                            <div className="vest-modal__addr-line">
                                <code className="vest-modal__addr-code">{s.beneficiary}</code>
                                <CopyButton text={s.beneficiary} />
                            </div>
                        </div>
                        <div className="vest-modal__addr-item">
                            <span className="vest-modal__label">Token Contract</span>
                            <div className="vest-modal__addr-line">
                                <code className="vest-modal__addr-code">{s.token}</code>
                                <CopyButton text={s.token} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Technical Info */}
                <div className="vest-modal__section">
                    <h3 className="vest-modal__section-title">Technical</h3>
                    <div className="vest-modal__grid">
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Schedule ID</span>
                            <span className="vest-modal__value">{s.id.toString()}</span>
                        </div>
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Revocable</span>
                            <span className={`vest-modal__value ${s.revocable ? 'vest-modal__value--warn' : ''}`}>
                                {s.revocable ? 'Yes' : 'No'}
                            </span>
                        </div>
                        <div className="vest-modal__row">
                            <span className="vest-modal__label">Revoked</span>
                            <span className={`vest-modal__value ${s.revoked ? 'vest-modal__value--red' : ''}`}>
                                {s.revoked ? 'Yes' : 'No'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
