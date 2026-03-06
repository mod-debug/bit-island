import { useState, useCallback } from 'react';
import { SCHEDULE_STATUS, type VestingSchedule } from '../../types/index.js';
import { usePendingFlows } from '../../stores/pendingFlowStore.js';
import { ScheduleCard } from './ScheduleCard.js';
import { ScheduleDetailsModal } from './ScheduleDetailsModal.js';

type TabId = 'all' | 'beneficiary' | 'created';

const STATUS_LABELS: Record<number, string> = {
    [SCHEDULE_STATUS.ACTIVE]: 'Active',
    [SCHEDULE_STATUS.REVOKED]: 'Revoked',
    [SCHEDULE_STATUS.FULLY_VESTED]: 'Fully Vested',
    [SCHEDULE_STATUS.CLIFF_PENDING]: 'Cliff Pending',
};

function exportCSV(list: VestingSchedule[]): void {
    const header = 'ID,Status,Creator,Beneficiary,Token,Total,Vested,Claimed,Claimable,Start Block,Cliff Blocks,Duration Blocks,Revocable';
    const rows = list.map((s) => [
        s.id.toString(),
        STATUS_LABELS[s.status] ?? 'Unknown',
        s.creator,
        s.beneficiary,
        s.token,
        s.totalAmount.toString(),
        s.vestedAmount.toString(),
        s.claimedAmount.toString(),
        s.claimableAmount.toString(),
        s.startBlock.toString(),
        s.cliffBlocks.toString(),
        s.durationBlocks.toString(),
        s.revocable ? 'Yes' : 'No',
    ].join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `banana-vault-schedules-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

interface ScheduleListProps {
    readonly schedules: VestingSchedule[];
    readonly myBeneficiary: VestingSchedule[];
    readonly myCreated: VestingSchedule[];
    readonly walletAddress: string | null;
    readonly onClaim: (s: VestingSchedule) => void;
    readonly onRevoke: (s: VestingSchedule) => void;
    readonly onTransfer: (s: VestingSchedule) => void;
    readonly claiming: bigint | null;
    readonly revoking: bigint | null;
    readonly transferring: bigint | null;
    readonly currentBlock: bigint;
    readonly loading: boolean;
    readonly error: string | null;
    readonly onRefresh: () => void;
    readonly recentlyClaimed: Set<string>;
}

export function ScheduleList({
    schedules,
    myBeneficiary,
    myCreated,
    walletAddress,
    onClaim,
    onRevoke,
    onTransfer,
    claiming,
    revoking,
    transferring,
    currentBlock,
    loading,
    error,
    onRefresh,
    recentlyClaimed,
}: ScheduleListProps): React.JSX.Element {
    const [tab, setTab] = useState<TabId>('all');
    const [selectedSchedule, setSelectedSchedule] = useState<VestingSchedule | null>(null);
    const pendingFlows = usePendingFlows();

    const handleOpenDetails = useCallback((s: VestingSchedule) => {
        setSelectedSchedule(s);
    }, []);

    const handleCloseDetails = useCallback(() => {
        setSelectedSchedule(null);
    }, []);

    const active = tab === 'all' ? schedules : tab === 'beneficiary' ? myBeneficiary : myCreated;

    // Show pending banner only when the CONNECTED wallet has active vault pending flows
    const walletLower = walletAddress?.toLowerCase() ?? '';
    const hasPendingTx = walletLower.length > 0 && !loading && pendingFlows.some(
        (f) => f.id.startsWith('vault-') && f.stage !== 'ready' && f.walletAddress.toLowerCase() === walletLower,
    );

    return (
        <section className="vest-list-section" id="vest-browse">
            <div className="vest-list-section__header">
                <h2 className="vest-list-section__title">Vesting Schedules</h2>
                <div className="vest-list-section__actions">
                    <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => { exportCSV(active); }}
                        disabled={active.length === 0}
                        title="Export visible schedules as CSV"
                    >
                        Export CSV
                    </button>
                    <button className="btn btn--ghost btn--sm" onClick={onRefresh} disabled={loading}>
                        {loading ? 'Loading…' : 'Refresh'}
                    </button>
                </div>
            </div>

            <div className="vest-tabs">
                <button
                    className={`vest-tab ${tab === 'all' ? 'vest-tab--active' : ''}`}
                    onClick={() => setTab('all')}
                >
                    All Schedules
                    <span className="vest-tab__count">{schedules.length}</span>
                </button>
                <button
                    className={`vest-tab ${tab === 'beneficiary' ? 'vest-tab--active' : ''}`}
                    onClick={() => setTab('beneficiary')}
                >
                    My Vesting
                    <span className="vest-tab__count">{myBeneficiary.length}</span>
                </button>
                <button
                    className={`vest-tab ${tab === 'created' ? 'vest-tab--active' : ''}`}
                    onClick={() => setTab('created')}
                >
                    I Created
                    <span className="vest-tab__count">{myCreated.length}</span>
                </button>
            </div>

            {error !== null && (
                <div className="vest-error">
                    <p>{error}</p>
                    <button className="btn btn--ghost btn--sm" onClick={onRefresh}>Retry</button>
                </div>
            )}

            {hasPendingTx && (
                <div className="vest-pending-banner">
                    <span className="vest-pending-banner__spinner" />
                    <div className="vest-pending-banner__text">
                        <strong>Transaction pending</strong>
                        <p>
                            Your recent transaction is waiting to be confirmed on-chain.
                            Schedules will appear automatically after block confirmation.
                            <br />
                            <span className="vest-pending-banner__hint">Auto-refreshing every 30s...</span>
                            {' — '}
                            <a href="#vault-history" className="vest-pending-banner__link">View Pending</a>
                        </p>
                    </div>
                    <button className="btn btn--ghost btn--sm" onClick={onRefresh}>
                        Refresh Now
                    </button>
                </div>
            )}

            {!loading && active.length === 0 && error === null && !hasPendingTx && (
                <div className="vest-empty">
                    <p className="vest-empty__icon">&#127820;</p>
                    <p className="vest-empty__text">
                        {tab === 'all' && 'No vesting schedules yet. Be the first to lock tokens!'}
                        {tab === 'beneficiary' && 'No tokens are vesting to your wallet yet.'}
                        {tab === 'created' && 'You haven\'t created any vesting schedules yet.'}
                    </p>
                    {tab !== 'all' && walletAddress === null && (
                        <p className="vest-empty__hint">Connect your wallet to see your schedules.</p>
                    )}
                </div>
            )}

            <div className="vest-grid">
                {active.map((s) => (
                    <ScheduleCard
                        key={s.id.toString()}
                        schedule={s}
                        walletAddress={walletAddress}
                        onClaim={onClaim}
                        onRevoke={onRevoke}
                        onTransfer={onTransfer}
                        onDetails={handleOpenDetails}
                        claiming={claiming}
                        revoking={revoking}
                        transferring={transferring}
                        currentBlock={currentBlock}
                        recentlyClaimed={recentlyClaimed}
                    />
                ))}
            </div>

            {selectedSchedule !== null && (
                <ScheduleDetailsModal
                    schedule={selectedSchedule}
                    isOpen={true}
                    onClose={handleCloseDetails}
                    currentBlock={currentBlock}
                    walletAddress={walletAddress}
                />
            )}
        </section>
    );
}
