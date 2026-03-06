import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { VestingHero } from './VestingHero.js';
import { VestingStatsBar } from './VestingStats.js';
import { ClaimPanel } from './ClaimPanel.js';
import { ScheduleList } from './ScheduleList.js';
import { CreateSchedule } from './CreateSchedule.js';
import { VestingCalendar } from './VestingCalendar.js';
import { VaultTxHistory } from './VaultTxHistory.js';
import { ScheduleDetailsModal } from './ScheduleDetailsModal.js';
import { TransferModal } from './TransferModal.js';
import { FirefliesCanvas } from '../autovault/FirefliesCanvas.js';
import { useVestingVault } from '../../hooks/useVestingVault.js';
import { vestingService } from '../../services/VestingVaultService.js';
import type { VestingSchedule } from '../../types/index.js';
import type { PendingFlow } from '../../stores/pendingFlowStore.js';

export function VestingDashboard(): React.JSX.Element {
    const { walletAddress } = useWalletConnect();
    const vault = useVestingVault();
    const [searchParams, setSearchParams] = useSearchParams();

    // Share link: auto-open modal for ?view=<scheduleId>
    const viewId = searchParams.get('view');

    // Derive from loaded schedules (synchronous — no setState in effect)
    const sharedFromCache = useMemo((): VestingSchedule | null => {
        if (viewId === null || vault.loading) return null;
        const id = BigInt(viewId);
        return vault.schedules.find((s) => s.id === id) ?? null;
    }, [viewId, vault.schedules, vault.loading]);

    // Async fallback: fetch schedule not yet in cache
    const [fetchedShared, setFetchedShared] = useState<VestingSchedule | null>(null);

    useEffect(() => {
        if (viewId === null || vault.loading || sharedFromCache !== null) {
            setFetchedShared(null);
            return;
        }
        const id = BigInt(viewId);
        void vestingService.getSchedule(id, vault.currentBlock).then((s) => {
            if (s !== null) setFetchedShared(s);
        });
    }, [viewId, vault.loading, vault.currentBlock, sharedFromCache]);

    const sharedSchedule = sharedFromCache ?? fetchedShared;

    const handleCloseShared = useCallback((): void => {
        setFetchedShared(null);
        setSearchParams({}, { replace: true });
    }, [setSearchParams]);

    // ── Transfer state ──
    const [transferTarget, setTransferTarget] = useState<VestingSchedule | null>(null);

    const handleOpenTransfer = useCallback((s: VestingSchedule) => {
        setTransferTarget(s);
    }, []);

    const handleCloseTransfer = useCallback(() => {
        setTransferTarget(null);
    }, []);

    const handleConfirmTransfer = useCallback(async (s: VestingSchedule, newBeneficiary: string): Promise<boolean> => {
        const ok = await vault.transferSchedule(s, newBeneficiary);
        if (ok) setTransferTarget(null);
        return ok;
    }, [vault]);

    const handleResumeFlow = useCallback((flow: PendingFlow) => {
        if (flow.type === 'claim') {
            void vault.executeQueuedClaim(flow);
        } else {
            void vault.resumeCreateSchedule(flow);
        }
    }, [vault]);

    return (
        <main className="vault-page">
            <FirefliesCanvas />
            <VestingHero />
            <VestingStatsBar
                stats={vault.stats}
                currentBlock={vault.currentBlock}
                loading={vault.loading}
            />
            <VestingCalendar
                schedules={vault.schedules}
                currentBlock={vault.currentBlock}
            />
            <ClaimPanel
                myBeneficiary={vault.myBeneficiary}
                onClaim={vault.claimTokens}
                onClaimAll={vault.claimAll}
                claiming={vault.claiming}
                claimingAll={vault.claimingAll}
                recentlyClaimed={vault.recentlyClaimed}
            />
            <ScheduleList
                schedules={vault.schedules}
                myBeneficiary={vault.myBeneficiary}
                myCreated={vault.myCreated}
                walletAddress={walletAddress}
                onClaim={vault.claimTokens}
                onRevoke={vault.revokeSchedule}
                onTransfer={handleOpenTransfer}
                claiming={vault.claiming}
                revoking={vault.revoking}
                transferring={vault.transferring}
                currentBlock={vault.currentBlock}
                loading={vault.loading}
                error={vault.error}
                onRefresh={vault.fetchSchedules}
                recentlyClaimed={vault.recentlyClaimed}
            />
            <VaultTxHistory
                awaitingContinue={vault.awaitingContinue}
                onConfirmContinue={vault.confirmContinue}
                onResumeFlow={handleResumeFlow}
                creating={vault.creating}
                batchCreating={vault.batchCreating}
                batchProgress={vault.batchProgress}
                resumingFlowId={vault.resumingFlowId}
                claimBusy={vault.claiming !== null}
            />
            <CreateSchedule
                creating={vault.creating}
                createSteps={vault.createSteps}
                createError={vault.createError}
                lastCreatedId={vault.lastCreatedId}
                awaitingContinue={vault.awaitingContinue}
                onConfirmContinue={vault.confirmContinue}
                onCreateSchedule={vault.createSchedule}
                onReset={vault.resetCreate}
                walletConnected={walletAddress !== null && walletAddress !== undefined}
                onCreateBatch={vault.createBatchSchedules}
                batchCreating={vault.batchCreating}
                batchProgress={vault.batchProgress}
                batchError={vault.batchError}
            />

            {/* Share link modal */}
            {sharedSchedule !== null && (
                <ScheduleDetailsModal
                    schedule={sharedSchedule}
                    isOpen={true}
                    onClose={handleCloseShared}
                    currentBlock={vault.currentBlock}
                    walletAddress={walletAddress}
                />
            )}

            {/* Transfer modal */}
            {transferTarget !== null && (
                <TransferModal
                    schedule={transferTarget}
                    isOpen={true}
                    onClose={handleCloseTransfer}
                    onConfirm={handleConfirmTransfer}
                    transferring={vault.transferring === transferTarget.id}
                />
            )}
        </main>
    );
}
