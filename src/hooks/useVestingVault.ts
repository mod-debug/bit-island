import { useState, useEffect, useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { vestingService } from '../services/VestingVaultService.js';
import { getVestingVaultAddress } from '../config/contracts.js';
import { useToast } from '../components/Toast.js';
import {
    type VestingSchedule,
    type VestingStats,
    type TxStep,
    type CreateScheduleParams,
} from '../types/index.js';
import { addTxEntry } from '../stores/txHistoryStore.js';
import {
    addPendingFlow,
    updateFlowStage,
    updateFlowFields,
    removePendingFlow,
    usePendingFlows,
    type PendingFlow,
} from '../stores/pendingFlowStore.js';
import { formatTokenAmount } from '../utils/tokenAmount.js';

const DEFAULT_FEE_RATE = 10;
const POLL_INTERVAL_MS = 30_000;
const CLAIM_STORAGE_KEY = 'vesting_recently_claimed';
const CLAIM_BLOCK_MS = 10 * 60 * 1000;

function makeStep(label: string): TxStep {
    return { label, status: 'idle' };
}

export function useVestingVault() {
    const { walletAddress, network } = useWalletConnect();
    const { toast } = useToast();

    const [schedules, setSchedules] = useState<VestingSchedule[]>([]);
    const [myBeneficiary, setMyBeneficiary] = useState<VestingSchedule[]>([]);
    const [myCreated, setMyCreated] = useState<VestingSchedule[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentBlock, setCurrentBlock] = useState<bigint>(0n);
    const [stats, setStats] = useState<VestingStats>({
        activeSchedules: 0,
        totalSchedules: 0,
        totalClaimed: 0,
        yourClaimable: 0n,
        totalValueLocked: 0n,
        tvlByToken: [],
    });

    const pendingFlows = usePendingFlows();
    const prevClaimedRef = useRef<Map<string, bigint>>(new Map());

    // Initialize service
    useEffect(() => {
        if (network === null) return;
        try {
            const addr = getVestingVaultAddress(network);
            vestingService.initialize(addr, network);
        } catch {
            // Not deployed yet
        }
    }, [network, walletAddress]);

    // Fetch all schedules
    const fetchSchedules = useCallback(async (): Promise<void> => {
        if (network === null) return;
        setLoading(true);
        setError(null);
        try {
            const addr = getVestingVaultAddress(network);
            vestingService.initialize(addr, network);

            const block = await vestingService.getCurrentBlock();
            setCurrentBlock(block);

            const all = await vestingService.getAllSchedules(block);
            setSchedules(all);

            if (walletAddress !== null && walletAddress !== undefined) {
                const lower = walletAddress.toLowerCase();
                const benef = all.filter((s) => s.beneficiary.toLowerCase() === lower);
                setMyBeneficiary(benef);
                setMyCreated(all.filter((s) => s.creator.toLowerCase() === lower));

                // Clear recentlyClaimed only when on-chain claimedAmount has increased
                // (proves the claim tx is confirmed and amounts refreshed)
                setRecentlyClaimed((prev) => {
                    if (prev.size === 0) return prev;
                    const next = new Set(prev);
                    let changed = false;
                    for (const s of benef) {
                        const idStr = s.id.toString();
                        if (!prev.has(idStr)) continue;
                        const prevClaimed = prevClaimedRef.current.get(idStr);
                        if (prevClaimed !== undefined && s.claimedAmount > prevClaimed) {
                            next.delete(idStr);
                            changed = true;
                        }
                    }
                    return changed ? next : prev;
                });

                // Track claimedAmount per schedule for next comparison
                const claimedMap = new Map<string, bigint>();
                for (const s of benef) claimedMap.set(s.id.toString(), s.claimedAmount);
                prevClaimedRef.current = claimedMap;
            } else {
                setMyBeneficiary([]);
                setMyCreated([]);
            }

            const st = await vestingService.getStats(block, walletAddress ?? undefined);
            setStats(st);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch schedules');
        } finally {
            setLoading(false);
        }
    }, [network, walletAddress]);

    useEffect(() => {
        void fetchSchedules();
    }, [fetchSchedules]);

    // Auto-refresh polling every 30s
    useEffect(() => {
        const interval = setInterval(() => {
            void fetchSchedules();
        }, POLL_INTERVAL_MS);
        return () => { clearInterval(interval); };
    }, [fetchSchedules]);

    // ── Mount recovery: poll approveTxId for stuck vault flows ─────────────────

    useEffect(() => {
        if (network === null || walletAddress === null || walletAddress === undefined) return;
        const walletLower = walletAddress.toLowerCase();
        const myFlows = pendingFlows.filter(
            (f) => f.walletAddress.toLowerCase() === walletLower && f.id.startsWith('vault-'),
        );
        if (myFlows.length === 0) return;

        let cancelled = false;

        for (const flow of myFlows) {
            if (flow.stage === 'approved' || flow.stage === 'confirming') {
                if (flow.stage === 'approved') {
                    updateFlowStage(flow.id, 'confirming');
                }
                void (async () => {
                    try {
                        await vestingService.waitForTransaction(flow.approveTxId);
                        if (!cancelled) {
                            updateFlowStage(flow.id, 'ready');
                        }
                    } catch {
                        if (!cancelled) {
                            updateFlowStage(flow.id, 'ready');
                        }
                    }
                })();
            } else if (flow.stage === 'finalizing') {
                // Final tx already sent — wait for confirmation before removing
                const txToWatch = flow.finalizeTxId ?? flow.approveTxId;
                void (async () => {
                    try {
                        await vestingService.waitForTransaction(txToWatch);
                        if (!cancelled) {
                            removePendingFlow(flow.id);
                            void fetchSchedules();
                        }
                    } catch {
                        // Tx might have already confirmed or timed out — clean up
                        if (!cancelled) {
                            removePendingFlow(flow.id);
                        }
                    }
                })();
            }
        }

        return () => { cancelled = true; };
        // Only run on mount / wallet change — NOT on pendingFlows changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [network, walletAddress]);

    // ── Create Schedule (2-step: approve + create) ────────────────────────────

    const [createSteps, setCreateSteps] = useState<TxStep[]>([
        makeStep('Approve token'),
        makeStep('Block confirmation'),
        makeStep('Create schedule'),
    ]);
    const [creating, setCreating] = useState(false);
    const creatingRef = useRef(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [lastCreatedId, setLastCreatedId] = useState<bigint | null>(null);

    const [awaitingContinue, setAwaitingContinue] = useState(false);
    const continueResolverRef = useRef<(() => void) | null>(null);

    const [resumingFlowId, setResumingFlowId] = useState<string | null>(null);
    const resumingFlowIdRef = useRef<string | null>(null);

    const confirmContinue = useCallback((): void => {
        if (resumingFlowIdRef.current !== null) return;
        if (continueResolverRef.current !== null) {
            continueResolverRef.current();
            continueResolverRef.current = null;
        }
        setAwaitingContinue(false);
    }, []);

    const cancelPendingContinue = useCallback((): void => {
        continueResolverRef.current = null;
        setAwaitingContinue(false);
    }, []);

    const waitForUserContinue = (): Promise<void> => {
        return new Promise<void>((resolve) => {
            continueResolverRef.current = resolve;
            setAwaitingContinue(true);
        });
    };

    const setCreateStep = (index: number, patch: Partial<TxStep>): void => {
        setCreateSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    };

    const resetCreate = useCallback((): void => {
        setCreateSteps([makeStep('Approve token'), makeStep('Block confirmation'), makeStep('Create schedule')]);
        setCreating(false);
        creatingRef.current = false;
        setCreateError(null);
        setLastCreatedId(null);
        setAwaitingContinue(false);
        continueResolverRef.current = null;
    }, []);

    const createSchedule = useCallback(
        async (params: CreateScheduleParams): Promise<bigint | null> => {
            if (creatingRef.current) return null;
            if (walletAddress === null || walletAddress === undefined || network === null) {
                setCreateError('Connect your wallet first');
                return null;
            }

            creatingRef.current = true;
            setCreating(true);
            setCreateError(null);
            setCreateSteps([makeStep('Approve token'), makeStep('Block confirmation'), makeStep('Create schedule')]);

            try {
                // Step 1: Approve
                setCreateStep(0, { status: 'pending' });
                const approveTxId = await vestingService.approveToken(
                    params.token,
                    params.totalAmount,
                    walletAddress,
                    DEFAULT_FEE_RATE,
                );
                setCreateStep(0, { status: 'done', txId: approveTxId });

                const sym = await vestingService.resolveTokenSymbol(params.token);
                const dec = await vestingService.resolveTokenDecimals(params.token);
                addTxEntry('approve', null, approveTxId, 'ok', `Approve ${sym} — allowance for Monkey Vesting`, walletAddress);
                toast('info', 'Token Approved!', `${sym} allowance set — waiting for confirmation.`, '#vault-history');

                // Persist pending flow WITH create params for resume
                const flowId = `vault-create-${Date.now()}`;
                addPendingFlow({
                    id: flowId,
                    type: 'create',
                    stage: 'approved',
                    walletAddress,
                    approveTxId,
                    startedAt: Date.now(),
                    description: `Vesting ${formatTokenAmount(params.totalAmount, dec)} ${sym}`,
                    beneficiary: params.beneficiary,
                    token: params.token,
                    totalAmount: params.totalAmount.toString(),
                    cliffBlocks: params.cliffBlocks.toString(),
                    durationBlocks: params.durationBlocks.toString(),
                    revocable: params.revocable,
                    vestingType: params.vestingType,
                    stepsCount: params.stepsCount,
                });

                // Step 2: Wait for confirmation
                setCreateStep(1, { status: 'pending' });
                updateFlowStage(flowId, 'confirming');
                await vestingService.waitForTransaction(approveTxId);
                setCreateStep(1, { status: 'done' });
                updateFlowStage(flowId, 'ready');

                // Pause for user
                toast('info', 'Block confirmed!', 'Click "Continue" when you are ready for the final signature.');
                await waitForUserContinue();

                // Step 3: Create schedule
                setCreateStep(2, { status: 'pending' });
                updateFlowStage(flowId, 'finalizing');
                const { scheduleId, txId } = await vestingService.createSchedule(
                    params.beneficiary,
                    params.token,
                    params.totalAmount,
                    params.cliffBlocks,
                    params.durationBlocks,
                    params.revocable,
                    walletAddress,
                    DEFAULT_FEE_RATE,
                    params.vestingType,
                    params.stepsCount,
                );
                setCreateStep(2, { status: 'done', txId });
                setLastCreatedId(scheduleId);
                addTxEntry('create', scheduleId, txId, 'ok', `Created vesting #${scheduleId.toString()} — ${formatTokenAmount(params.totalAmount, dec)} ${sym}`, walletAddress);
                updateFlowStage(flowId, 'finalizing', txId);
                toast('success', 'Schedule Created!', `Vesting #${scheduleId.toString()} — waiting for confirmation.`);

                void fetchSchedules();
                // Background: wait for tx confirmation then remove pending flow
                void (async () => {
                    try {
                        await vestingService.waitForTransaction(txId);
                        removePendingFlow(flowId);
                        await fetchSchedules();
                    } catch {
                        removePendingFlow(flowId);
                    }
                })();
                return scheduleId;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Create schedule failed';
                setCreateError(msg);
                addTxEntry('create', null, '', 'error', `Failed: ${msg}`, walletAddress);
                toast('error', 'Failed to create schedule', msg);
                setCreateSteps((prev) =>
                    prev.map((s) => (s.status === 'pending' ? { ...s, status: 'error', error: msg } : s)),
                );
                return null;
            } finally {
                creatingRef.current = false;
                setCreating(false);
                setAwaitingContinue(false);
                continueResolverRef.current = null;
            }
        },
        [walletAddress, network, fetchSchedules, toast],
    );

    // ── Resume Create Schedule (skip approve, go straight to finalize) ────────

    const resumeCreateSchedule = useCallback(
        async (flow: PendingFlow): Promise<bigint | null> => {
            if (resumingFlowIdRef.current !== null || creatingRef.current) return null;
            if (walletAddress === null || walletAddress === undefined || network === null) {
                toast('error', 'Wallet not connected', 'Connect your wallet to resume.');
                return null;
            }
            if (flow.beneficiary === undefined || flow.token === undefined ||
                flow.totalAmount === undefined || flow.cliffBlocks === undefined ||
                flow.durationBlocks === undefined || flow.revocable === undefined) {
                toast('error', 'Invalid flow', 'Missing schedule parameters. Please dismiss and re-create.');
                removePendingFlow(flow.id);
                return null;
            }

            cancelPendingContinue();
            resumingFlowIdRef.current = flow.id;
            setResumingFlowId(flow.id);
            creatingRef.current = true;
            setCreating(true);
            setCreateError(null);
            setCreateSteps([
                { label: 'Approve token', status: 'done', txId: flow.approveTxId },
                { label: 'Block confirmation', status: 'done' },
                makeStep('Create schedule'),
            ]);

            try {
                setCreateStep(2, { status: 'pending' });
                updateFlowStage(flow.id, 'finalizing');
                const { scheduleId, txId } = await vestingService.createSchedule(
                    flow.beneficiary,
                    flow.token,
                    BigInt(flow.totalAmount),
                    BigInt(flow.cliffBlocks),
                    BigInt(flow.durationBlocks),
                    flow.revocable,
                    walletAddress,
                    DEFAULT_FEE_RATE,
                    flow.vestingType ?? 0,
                    flow.stepsCount ?? 0,
                );
                setCreateStep(2, { status: 'done', txId });
                setLastCreatedId(scheduleId);
                addTxEntry('create', scheduleId, txId, 'ok', `Created vesting #${scheduleId.toString()} (resumed)`, walletAddress);
                updateFlowStage(flow.id, 'finalizing', txId);
                toast('success', 'Schedule Created!', `Vesting #${scheduleId.toString()} — waiting for confirmation.`);

                void fetchSchedules();
                // Background: wait for tx confirmation then remove pending flow
                void (async () => {
                    try {
                        await vestingService.waitForTransaction(txId);
                        removePendingFlow(flow.id);
                        await fetchSchedules();
                    } catch {
                        removePendingFlow(flow.id);
                    }
                })();
                return scheduleId;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Resume create failed';
                setCreateError(msg);
                addTxEntry('create', null, '', 'error', `Failed to resume: ${msg}`, walletAddress);
                toast('error', 'Failed to create schedule', msg);
                setCreateSteps((prev) =>
                    prev.map((s) => (s.status === 'pending' ? { ...s, status: 'error', error: msg } : s)),
                );
                return null;
            } finally {
                creatingRef.current = false;
                setCreating(false);
                setResumingFlowId(null);
                resumingFlowIdRef.current = null;
            }
        },
        [walletAddress, network, fetchSchedules, toast, cancelPendingContinue],
    );

    // ── Batch Create ─────────────────────────────────────────────────────────

    const [batchCreating, setBatchCreating] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
    const [batchError, setBatchError] = useState<string | null>(null);

    const createBatchSchedules = useCallback(
        async (paramsList: CreateScheduleParams[]): Promise<void> => {
            if (paramsList.length === 0) return;
            if (walletAddress === null || walletAddress === undefined || network === null) {
                setBatchError('Connect your wallet first');
                return;
            }

            setBatchCreating(true);
            setBatchError(null);
            setBatchProgress({ current: 0, total: paramsList.length });

            try {
                // Single approval for the total amount
                const totalAmount = paramsList.reduce((sum, p) => sum + p.totalAmount, 0n);
                const firstParam = paramsList[0];
                if (firstParam === undefined) return;
                const token = firstParam.token;

                toast('info', 'Batch: Approving tokens...', `Approving total amount for ${paramsList.length} schedules.`, '#vault-history');
                const approveTxId = await vestingService.approveToken(token, totalAmount, walletAddress, DEFAULT_FEE_RATE);

                const sym = await vestingService.resolveTokenSymbol(token);
                const dec = await vestingService.resolveTokenDecimals(token);
                addTxEntry('approve', null, approveTxId, 'ok', `Batch approve ${sym} for ${paramsList.length} schedules`, walletAddress);

                // Persist batch pending flow
                const batchFlowId = `vault-batch-${Date.now()}`;
                addPendingFlow({
                    id: batchFlowId,
                    type: 'create',
                    stage: 'approved',
                    walletAddress,
                    approveTxId,
                    startedAt: Date.now(),
                    description: `Batch: ${paramsList.length} vestings (${formatTokenAmount(totalAmount, dec)} ${sym})`,
                    token,
                });

                toast('info', 'Batch: Waiting for confirmation...', 'Approval sent — waiting for block confirmation.', '#vault-history');
                updateFlowStage(batchFlowId, 'confirming');

                await vestingService.waitForTransaction(approveTxId);
                updateFlowStage(batchFlowId, 'finalizing');
                toast('info', 'Batch: Approval confirmed!', 'Creating schedules sequentially...', '#vault-history');

                // Create schedules one by one
                let created = 0;
                let lastTxId = '';
                for (let i = 0; i < paramsList.length; i++) {
                    setBatchProgress({ current: i + 1, total: paramsList.length });
                    const p = paramsList[i];
                    if (p === undefined) continue;

                    const { scheduleId, txId } = await vestingService.createSchedule(
                        p.beneficiary,
                        p.token,
                        p.totalAmount,
                        p.cliffBlocks,
                        p.durationBlocks,
                        p.revocable,
                        walletAddress,
                        DEFAULT_FEE_RATE,
                        p.vestingType,
                        p.stepsCount,
                    );

                    addTxEntry('create', scheduleId, txId, 'ok', `Batch #${i + 1}: Created vesting #${scheduleId.toString()} — ${formatTokenAmount(p.totalAmount, dec)} ${sym}`, walletAddress);
                    lastTxId = txId;
                    created++;
                }

                // Keep pending flow alive until last tx is confirmed
                if (lastTxId.length > 0) {
                    updateFlowStage(batchFlowId, 'finalizing', lastTxId);
                }
                toast('success', 'Batch Complete!', `${created} schedules sent — waiting for confirmation.`, '#vault-history');
                void fetchSchedules();

                // Background: wait for last tx confirmation then remove pending flow
                if (lastTxId.length > 0) {
                    void (async () => {
                        try {
                            await vestingService.waitForTransaction(lastTxId);
                            removePendingFlow(batchFlowId);
                            await fetchSchedules();
                        } catch {
                            removePendingFlow(batchFlowId);
                        }
                    })();
                } else {
                    removePendingFlow(batchFlowId);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Batch create failed';
                setBatchError(msg);
                toast('error', 'Batch failed', msg);
            } finally {
                setBatchCreating(false);
                setBatchProgress(null);
            }
        },
        [walletAddress, network, fetchSchedules, toast],
    );

    // ── Claim ─────────────────────────────────────────────────────────────────

    /** Load persisted claim blocks from localStorage, pruning expired entries. */
    const loadClaimedFromStorage = useCallback((): Set<string> => {
        try {
            const raw = localStorage.getItem(CLAIM_STORAGE_KEY);
            if (raw === null) return new Set();
            const entries = JSON.parse(raw) as Record<string, number>;
            const now = Date.now();
            const alive = new Set<string>();
            const kept: Record<string, number> = {};
            for (const [id, expiresAt] of Object.entries(entries)) {
                if (expiresAt > now) {
                    alive.add(id);
                    kept[id] = expiresAt;
                }
            }
            localStorage.setItem(CLAIM_STORAGE_KEY, JSON.stringify(kept));
            return alive;
        } catch {
            return new Set();
        }
    }, []);

    const [claiming, setClaiming] = useState<bigint | null>(null);
    const [claimError, setClaimError] = useState<string | null>(null);
    const [recentlyClaimed, setRecentlyClaimed] = useState<Set<string>>(() => loadClaimedFromStorage());

    /** Persist a claim block to localStorage + state. */
    const markClaimed = useCallback((idStr: string): void => {
        const expiresAt = Date.now() + CLAIM_BLOCK_MS;
        try {
            const raw = localStorage.getItem(CLAIM_STORAGE_KEY);
            const entries: Record<string, number> = raw !== null ? JSON.parse(raw) as Record<string, number> : {};
            entries[idStr] = expiresAt;
            localStorage.setItem(CLAIM_STORAGE_KEY, JSON.stringify(entries));
        } catch { /* localStorage full — in-memory fallback still works */ }

        setRecentlyClaimed((prev) => new Set(prev).add(idStr));
        setTimeout(() => {
            setRecentlyClaimed((prev) => {
                const next = new Set(prev);
                next.delete(idStr);
                return next;
            });
            try {
                const raw = localStorage.getItem(CLAIM_STORAGE_KEY);
                if (raw !== null) {
                    const entries = JSON.parse(raw) as Record<string, number>;
                    delete entries[idStr];
                    localStorage.setItem(CLAIM_STORAGE_KEY, JSON.stringify(entries));
                }
            } catch { /* ignore */ }
        }, CLAIM_BLOCK_MS);
    }, []);

    const claimTokens = useCallback(
        async (schedule: VestingSchedule): Promise<boolean> => {
            if (walletAddress === null || walletAddress === undefined || network === null) return false;

            const idStr = schedule.id.toString();
            if (recentlyClaimed.has(idStr)) {
                toast('info', 'Already claimed', 'Wait for the next block before claiming again.');
                return false;
            }

            setClaiming(schedule.id);
            setClaimError(null);
            const flowId = `vault-claim-${idStr}-${Date.now()}`;
            try {
                const { txId, claimed } = await vestingService.claim(schedule.id, walletAddress, DEFAULT_FEE_RATE);
                const sym = await vestingService.resolveTokenSymbol(schedule.token);
                const dec = await vestingService.resolveTokenDecimals(schedule.token);
                const amt = formatTokenAmount(claimed, dec);

                addPendingFlow({
                    id: flowId,
                    type: 'claim',
                    stage: 'finalizing',
                    walletAddress,
                    approveTxId: txId,
                    startedAt: Date.now(),
                    description: `Claim ${amt} ${sym} from vesting #${idStr}`,
                    token: schedule.token,
                });

                addTxEntry('accept', schedule.id, txId, 'ok', `Claimed ${amt} ${sym} from vesting #${idStr}`, walletAddress);
                toast('success', 'Tokens Claimed!', `${amt} ${sym} — waiting for confirmation.`, '#vault-history');

                markClaimed(idStr);

                void fetchSchedules();
                // Background: wait for tx confirmation then re-fetch to update amounts
                void (async () => {
                    try {
                        await vestingService.waitForTransaction(txId);
                        removePendingFlow(flowId);
                        await fetchSchedules();
                    } catch { /* ignore — polling will catch it eventually */ }
                })();
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Claim failed';
                setClaimError(msg);
                toast('error', 'Failed to claim', msg);
                removePendingFlow(flowId);
                return false;
            } finally {
                setClaiming(null);
            }
        },
        [walletAddress, network, fetchSchedules, toast, recentlyClaimed, markClaimed],
    );

    // ── Claim All (queue-based) ─────────────────────────────────────────────

    const [claimingAll, setClaimingAll] = useState(false);

    /**
     * Queue-based Claim All: creates individual pending flows for each schedule.
     * First claim executes immediately; remaining flows get stage='ready'
     * with a "Claim" button the user can click at their convenience.
     * All flows persist in localStorage — survives page refresh.
     */
    const claimAll = useCallback(
        async (schedules: VestingSchedule[]): Promise<void> => {
            if (walletAddress === null || walletAddress === undefined || network === null) return;
            if (schedules.length === 0) return;

            setClaimingAll(true);

            // Resolve token info for descriptions (should be cached from ClaimPanel)
            const tokenInfoMap = new Map<string, { sym: string; dec: number }>();
            for (const s of schedules) {
                if (!tokenInfoMap.has(s.token)) {
                    const sym = await vestingService.resolveTokenSymbol(s.token);
                    const dec = await vestingService.resolveTokenDecimals(s.token);
                    tokenInfoMap.set(s.token, { sym, dec });
                }
            }

            // Create individual pending flows — first one auto-starts, rest are 'ready'
            const flowIds: string[] = [];
            const now = Date.now();
            for (let i = 0; i < schedules.length; i++) {
                const s = schedules[i];
                if (s === undefined) continue;
                const info = tokenInfoMap.get(s.token);
                const sym = info?.sym ?? '?';
                const dec = info?.dec ?? 18;
                const amt = formatTokenAmount(s.claimableAmount, dec);
                const flowId = `vault-claim-${s.id.toString()}-${now}-${i}`;
                flowIds.push(flowId);

                addPendingFlow({
                    id: flowId,
                    type: 'claim',
                    stage: i === 0 ? 'finalizing' : 'ready',
                    walletAddress,
                    approveTxId: '',
                    startedAt: now + i,
                    description: `Claim ${amt} ${sym} from vesting #${s.id.toString()}`,
                    scheduleId: s.id.toString(),
                    token: s.token,
                });
            }

            // Execute the first claim immediately
            const firstSchedule = schedules[0];
            const firstFlowId = flowIds[0];
            if (firstSchedule !== undefined && firstFlowId !== undefined) {
                const idStr = firstSchedule.id.toString();
                try {
                    setClaiming(firstSchedule.id);
                    const { txId, claimed } = await vestingService.claim(firstSchedule.id, walletAddress, DEFAULT_FEE_RATE);
                    const info = tokenInfoMap.get(firstSchedule.token);
                    const sym = info?.sym ?? '?';
                    const dec = info?.dec ?? 18;
                    const amt = formatTokenAmount(claimed, dec);

                    updateFlowFields(firstFlowId, { finalizeTxId: txId, approveTxId: txId });
                    addTxEntry('accept', firstSchedule.id, txId, 'ok', `Claimed ${amt} ${sym} from vesting #${idStr}`, walletAddress);
                    markClaimed(idStr);

                    const remaining = schedules.length - 1;
                    toast('success', 'Claim Sent!', `${amt} ${sym} sent. ${remaining > 0 ? `${remaining} more in pending \u2014 click "Claim" when ready.` : ''}`);

                    // Background: wait for confirmation, then remove this flow + refresh
                    void (async () => {
                        try {
                            await vestingService.waitForTransaction(txId);
                            removePendingFlow(firstFlowId);
                            await fetchSchedules();
                        } catch { /* polling will catch it */ }
                    })();
                } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Claim failed';
                    toast('error', `Claim #${idStr} Failed`, msg);
                    removePendingFlow(firstFlowId);
                } finally {
                    setClaiming(null);
                }
            }

            setClaimingAll(false);
        },
        [walletAddress, network, fetchSchedules, toast, markClaimed],
    );

    /**
     * Execute a single queued claim from the pending table.
     * Called when the user clicks "Claim" on a ready claim flow.
     */
    const executeQueuedClaim = useCallback(
        async (flow: PendingFlow): Promise<void> => {
            if (walletAddress === null || walletAddress === undefined || network === null) return;
            if (flow.scheduleId === undefined) return;

            const scheduleId = BigInt(flow.scheduleId);
            setClaiming(scheduleId);
            updateFlowFields(flow.id, { stage: 'finalizing' });

            try {
                const { txId, claimed } = await vestingService.claim(scheduleId, walletAddress, DEFAULT_FEE_RATE);
                const sym = flow.token !== undefined ? await vestingService.resolveTokenSymbol(flow.token) : '?';
                const dec = flow.token !== undefined ? await vestingService.resolveTokenDecimals(flow.token) : 18;
                const amt = formatTokenAmount(claimed, dec);

                updateFlowFields(flow.id, { finalizeTxId: txId, approveTxId: txId });
                addTxEntry('accept', scheduleId, txId, 'ok', `Claimed ${amt} ${sym} from vesting #${flow.scheduleId}`, walletAddress);
                markClaimed(flow.scheduleId);
                toast('success', 'Claim Sent!', `${amt} ${sym} \u2014 waiting for confirmation.`);

                // Background: wait for confirmation, then remove flow + refresh
                void (async () => {
                    try {
                        await vestingService.waitForTransaction(txId);
                        removePendingFlow(flow.id);
                        await fetchSchedules();
                    } catch { /* polling will catch it */ }
                })();
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Claim failed';
                toast('error', 'Claim Failed', msg);
                updateFlowFields(flow.id, { stage: 'ready' }); // Reset to ready on failure
            } finally {
                setClaiming(null);
            }
        },
        [walletAddress, network, fetchSchedules, toast, markClaimed],
    );

    // ── Revoke ────────────────────────────────────────────────────────────────

    const [revoking, setRevoking] = useState<bigint | null>(null);
    const [revokeError, setRevokeError] = useState<string | null>(null);

    const revokeSchedule = useCallback(
        async (schedule: VestingSchedule): Promise<boolean> => {
            if (walletAddress === null || walletAddress === undefined || network === null) return false;

            setRevoking(schedule.id);
            setRevokeError(null);
            try {
                const txId = await vestingService.revoke(schedule.id, walletAddress, DEFAULT_FEE_RATE);
                const sym = await vestingService.resolveTokenSymbol(schedule.token);
                addTxEntry('cancel', schedule.id, txId, 'ok', `Revoked vesting #${schedule.id.toString()} — unvested ${sym} returned`, walletAddress);
                toast('success', 'Schedule Revoked', `Vesting #${schedule.id.toString()} — unvested tokens returned.`);
                void fetchSchedules();
                // Background: wait for tx confirmation then re-fetch
                void (async () => {
                    try {
                        await vestingService.waitForTransaction(txId);
                        await fetchSchedules();
                    } catch { /* ignore */ }
                })();
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Revoke failed';
                setRevokeError(msg);
                toast('error', 'Failed to revoke', msg);
                return false;
            } finally {
                setRevoking(null);
            }
        },
        [walletAddress, network, fetchSchedules, toast],
    );

    // ── Transfer Beneficiary ─────────────────────────────────────────────────

    const [transferring, setTransferring] = useState<bigint | null>(null);
    const [transferError, setTransferError] = useState<string | null>(null);

    const transferSchedule = useCallback(
        async (schedule: VestingSchedule, newBeneficiary: string): Promise<boolean> => {
            if (walletAddress === null || walletAddress === undefined || network === null) return false;

            setTransferring(schedule.id);
            setTransferError(null);
            try {
                const txId = await vestingService.transferBeneficiary(
                    schedule.id,
                    newBeneficiary,
                    walletAddress,
                    DEFAULT_FEE_RATE,
                );
                const sym = await vestingService.resolveTokenSymbol(schedule.token);
                addTxEntry('transfer', schedule.id, txId, 'ok', `Transferred vesting #${schedule.id.toString()} (${sym}) to new beneficiary`, walletAddress);
                toast('success', 'Schedule Transferred', `Vesting #${schedule.id.toString()} transferred to new beneficiary.`);
                void fetchSchedules();
                void (async () => {
                    try {
                        await vestingService.waitForTransaction(txId);
                        await fetchSchedules();
                    } catch { /* ignore */ }
                })();
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Transfer failed';
                setTransferError(msg);
                toast('error', 'Failed to transfer', msg);
                return false;
            } finally {
                setTransferring(null);
            }
        },
        [walletAddress, network, fetchSchedules, toast],
    );

    return {
        // Data
        schedules,
        myBeneficiary,
        myCreated,
        loading,
        error,
        currentBlock,
        stats,

        // Create flow
        creating,
        createSteps,
        createError,
        lastCreatedId,
        createSchedule,
        resetCreate,
        awaitingContinue,
        confirmContinue,

        // Resume
        resumeCreateSchedule,
        resumingFlowId,

        // Claim
        claiming,
        claimError,
        claimTokens,
        claimAll,
        claimingAll,
        executeQueuedClaim,
        recentlyClaimed,

        // Revoke
        revoking,
        revokeError,
        revokeSchedule,

        // Transfer
        transferring,
        transferError,
        transferSchedule,

        // Batch
        batchCreating,
        batchProgress,
        batchError,
        createBatchSchedules,

        // Refresh
        fetchSchedules,
    };
}
