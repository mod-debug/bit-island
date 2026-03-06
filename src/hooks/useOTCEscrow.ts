import { useState, useEffect, useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { escrowService, OTCEscrowService } from '../services/OTCEscrowService.js';
import { getOTCEscrowAddress } from '../config/contracts.js';
import { useToast } from '../components/Toast.js';
import { OFFER_STATUS, type Offer, type TxStep, type CreateOfferParams } from '../types/index.js';
import { addTxEntry } from '../stores/txHistoryStore.js';
import { formatTokenAmount } from '../utils/tokenAmount.js';
import {
    addPendingFlow,
    updateFlowStage,
    removePendingFlow,
    usePendingFlows,
    type PendingFlow,
} from '../stores/pendingFlowStore.js';

const DEFAULT_FEE_RATE = 10;

/** Steps for the 2-step create/accept flows */
function makeStep(label: string): TxStep {
    return { label, status: 'idle' };
}

/** Generate a unique flow ID */
function genFlowId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useOTCEscrow() {
    const { walletAddress, address, network, hashedMLDSAKey } = useWalletConnect() as ReturnType<typeof useWalletConnect> & { hashedMLDSAKey?: string | null };
    const { toast } = useToast();

    const [offers, setOffers] = useState<Offer[]>([]);
    const [myOffers, setMyOffers] = useState<Offer[]>([]);
    const [loadingOffers, setLoadingOffers] = useState(false);
    const [offersError, setOffersError] = useState<string | null>(null);

    const pendingFlows = usePendingFlows();

    // Initialize service whenever wallet or network changes
    useEffect(() => {
        if (network === null) return;
        try {
            const address = getOTCEscrowAddress(network);
            escrowService.initialize(address, network);
        } catch {
            // Network not configured yet (e.g. placeholder address)
        }
    }, [network, walletAddress]);

    // Fetch all offers
    const fetchOffers = useCallback(async (): Promise<void> => {
        if (network === null) return;
        setLoadingOffers(true);
        setOffersError(null);
        try {
            const contractAddress = getOTCEscrowAddress(network);
            escrowService.initialize(contractAddress, network);
            const all = await escrowService.getAllOffers();
            setOffers(all);
            if (walletAddress !== null && walletAddress !== undefined) {
                const myP2tr = walletAddress.toLowerCase();
                let myP2op: string | null = null;

                const addrBytes = address as unknown as Uint8Array | null | undefined;
                if (addrBytes != null && addrBytes.length === 32) {
                    try {
                        myP2op = OTCEscrowService.computeP2opFromBytes(addrBytes, network);
                    } catch { /* ignore */ }
                }

                if (myP2op === null && hashedMLDSAKey != null && hashedMLDSAKey.length >= 64) {
                    try {
                        const hex = hashedMLDSAKey.startsWith('0x') ? hashedMLDSAKey.slice(2) : hashedMLDSAKey;
                        const bytes = new Uint8Array(hex.length / 2);
                        for (let i = 0; i < bytes.length; i++) {
                            bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
                        }
                        myP2op = OTCEscrowService.computeP2opFromBytes(bytes, network);
                    } catch { /* ignore */ }
                }

                setMyOffers(all.filter((o) => {
                    const c = o.creator.toLowerCase();
                    return c === myP2tr || (myP2op !== null && c === myP2op.toLowerCase());
                }));
            } else {
                setMyOffers([]);
            }
        } catch (err) {
            setOffersError(err instanceof Error ? err.message : 'Failed to fetch offers');
        } finally {
            setLoadingOffers(false);
        }
    }, [network, walletAddress, address]);

    // Auto-fetch on mount and when wallet/network changes
    useEffect(() => {
        void fetchOffers();
    }, [fetchOffers]);

    // ── Mount recovery: poll approveTxId for 'approved' flows → promote to 'ready' ──

    useEffect(() => {
        if (network === null || walletAddress === null || walletAddress === undefined) return;
        const walletLower = walletAddress.toLowerCase();
        const myFlows = pendingFlows.filter(
            (f) => f.walletAddress.toLowerCase() === walletLower,
        );
        if (myFlows.length === 0) return;

        let cancelled = false;

        for (const flow of myFlows) {
            if (flow.stage === 'approved' || flow.stage === 'confirming') {
                // Approve not yet confirmed — poll approveTxId
                if (flow.stage === 'approved') {
                    updateFlowStage(flow.id, 'confirming');
                }
                void (async () => {
                    try {
                        await escrowService.waitForTransaction(flow.approveTxId);
                        if (!cancelled) {
                            updateFlowStage(flow.id, 'ready');
                        }
                    } catch {
                        if (!cancelled) {
                            updateFlowStage(flow.id, 'ready');
                        }
                    }
                })();
            } else if (flow.stage === 'finalizing' && flow.finalizeTxId !== undefined) {
                // Final tx sent but not yet confirmed — poll finalizeTxId
                void (async () => {
                    try {
                        await escrowService.waitForTransaction(flow.finalizeTxId as string);
                    } catch { /* ignore */ }
                    if (!cancelled) {
                        removePendingFlow(flow.id);
                    }
                })();
            }
        }

        return () => { cancelled = true; };
        // Only run on mount / wallet change — NOT on pendingFlows changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [network, walletAddress]);

    // ── Shared: "Continue" gate (pause between step 2 and 3) ───────────────────

    const [awaitingContinue, setAwaitingContinue] = useState(false);
    const continueResolverRef = useRef<(() => void) | null>(null);

    const confirmContinue = useCallback((): void => {
        // Guard: if a resume is already in progress, ignore notification clicks
        if (resumingFlowIdRef.current !== null) return;
        if (continueResolverRef.current !== null) {
            continueResolverRef.current();
            continueResolverRef.current = null;
        }
        setAwaitingContinue(false);
    }, []);

    const waitForUserContinue = (): Promise<void> => {
        return new Promise<void>((resolve) => {
            continueResolverRef.current = resolve;
            setAwaitingContinue(true);
        });
    };


    // ── Create Offer (3-step flow with pause) ────────────────────────────────

    const [createSteps, setCreateSteps] = useState<TxStep[]>([
        makeStep('Approve token'),
        makeStep('Block confirmation'),
        makeStep('Post offer'),
    ]);
    const [creating, setCreating] = useState(false);
    const creatingRef = useRef(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [lastCreatedId, setLastCreatedId] = useState<bigint | null>(null);

    const setCreateStep = (index: number, patch: Partial<TxStep>): void => {
        setCreateSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    };

    const resetCreate = useCallback((): void => {
        setCreateSteps([makeStep('Approve token'), makeStep('Block confirmation'), makeStep('Post offer')]);
        setCreating(false);
        creatingRef.current = false;
        setCreateError(null);
        setLastCreatedId(null);
        setAwaitingContinue(false);
        continueResolverRef.current = null;
    }, []);

    const createOffer = useCallback(
        async (params: CreateOfferParams): Promise<bigint | null> => {
            if (creatingRef.current) return null;
            if (walletAddress === null || walletAddress === undefined || network === null) {
                setCreateError('Connect your wallet first');
                return null;
            }

            creatingRef.current = true;
            setCreating(true);
            setCreateError(null);
            setCreateSteps([makeStep('Approve token'), makeStep('Block confirmation'), makeStep('Post offer')]);

            const shortOffer = params.offeredToken.length > 16 ? `${params.offeredToken.slice(0, 10)}…${params.offeredToken.slice(-4)}` : params.offeredToken;
            const shortWanted = params.wantedToken.length > 16 ? `${params.wantedToken.slice(0, 10)}…${params.wantedToken.slice(-4)}` : params.wantedToken;

            const flowId = genFlowId();

            try {
                // Step 1: Approve (user signs in wallet)
                setCreateStep(0, { status: 'pending' });

                let approveSkipped = false;
                let approveTxId = '';
                try {
                    approveTxId = await escrowService.approveOfferedToken(
                        params.offeredToken,
                        params.offeredAmount,
                        walletAddress,
                        DEFAULT_FEE_RATE,
                    );
                } catch (approveErr) {
                    const errMsg = approveErr instanceof Error ? approveErr.message : String(approveErr);
                    if (errMsg.toLowerCase().includes('already active') || errMsg.toLowerCase().includes('already approved')) {
                        approveSkipped = true;
                    } else {
                        throw approveErr;
                    }
                }

                if (approveSkipped) {
                    setCreateStep(0, { status: 'done' });
                    setCreateStep(1, { status: 'done' });
                    toast('info', 'Approval already done', 'Skipping to final signature.');
                } else {
                    setCreateStep(0, { status: 'done', txId: approveTxId });
                    addTxEntry('approve', null, approveTxId, 'ok', `Approve ${shortOffer} — allowance for escrow contract`, walletAddress);

                    // Resolve token symbols + decimals for human-readable description
                    const [offSym, offDec, wantSym, wantDec] = await Promise.all([
                        escrowService.resolveTokenSymbol(params.offeredToken),
                        escrowService.resolveTokenDecimals(params.offeredToken),
                        escrowService.resolveTokenSymbol(params.wantedToken),
                        escrowService.resolveTokenDecimals(params.wantedToken),
                    ]);
                    const flowDesc = `${formatTokenAmount(params.offeredAmount, offDec)} ${offSym} → ${formatTokenAmount(params.wantedAmount, wantDec)} ${wantSym}`;

                    // Save pending flow to localStorage
                    addPendingFlow({
                        id: flowId,
                        type: 'create',
                        stage: 'approved',
                        walletAddress,
                        approveTxId,
                        startedAt: Date.now(),
                        offeredToken: params.offeredToken,
                        offeredAmount: params.offeredAmount.toString(),
                        wantedToken: params.wantedToken,
                        wantedAmount: params.wantedAmount.toString(),
                        description: flowDesc,
                    });

                    // Step 2: Wait for block confirmation (automatic)
                    setCreateStep(1, { status: 'pending' });
                    updateFlowStage(flowId, 'confirming');
                    await escrowService.waitForTransaction(approveTxId);
                    setCreateStep(1, { status: 'done' });
                    updateFlowStage(flowId, 'ready');

                    // ── PAUSE: wait for user to click "Continue" ──
                    toast('info', 'Approval confirmed!', 'Click "Continue" on the form to sign the final transaction.', '#pending');
                    await waitForUserContinue();
                }

                // Step 3: Create offer (user signs again)
                setCreateStep(2, { status: 'pending' });
                const { offerId, txId } = await escrowService.createOffer(
                    params.offeredToken,
                    params.offeredAmount,
                    params.wantedToken,
                    params.wantedAmount,
                    walletAddress,
                    DEFAULT_FEE_RATE,
                );
                setCreateStep(2, { status: 'done', txId });
                setLastCreatedId(offerId);
                addTxEntry('create', offerId, txId, 'ok', `Created offer #${offerId.toString()} — Sell ${shortOffer} for ${shortWanted}`, walletAddress);
                toast('success', 'Deal Posted!', `Offer #${offerId.toString()} — waiting for mempool confirmation.`, '#pending');

                // Move to finalizing — wait for mempool confirmation before removing
                updateFlowStage(flowId, 'finalizing', txId);
                escrowService.waitForTransaction(txId).then(() => {
                    removePendingFlow(flowId);
                }).catch(() => {
                    removePendingFlow(flowId);
                });

                void fetchOffers();
                return offerId;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Create offer failed';
                setCreateError(msg);
                addTxEntry('create', null, '', 'error', `Failed to create offer: ${msg}`, walletAddress);
                toast('error', 'Failed to create deal', msg);
                setCreateSteps((prev) =>
                    prev.map((s) => (s.status === 'pending' ? { ...s, status: 'error', error: msg } : s)),
                );
                // Don't remove the pending flow on error — user can resume later
                return null;
            } finally {
                creatingRef.current = false;
                setCreating(false);
                setAwaitingContinue(false);
                continueResolverRef.current = null;
            }
        },
        [walletAddress, network, fetchOffers, toast],
    );

    // ── Accept Offer (2-step flow) ────────────────────────────────────────────

    const [acceptSteps, setAcceptSteps] = useState<TxStep[]>([
        makeStep('Approve token'),
        makeStep('Block confirmation'),
        makeStep('Accept offer'),
    ]);
    const [accepting, setAccepting] = useState(false);
    const [acceptError, setAcceptError] = useState<string | null>(null);
    const [acceptingOfferId, setAcceptingOfferId] = useState<bigint | null>(null);

    const setAcceptStep = (index: number, patch: Partial<TxStep>): void => {
        setAcceptSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    };

    const resetAccept = useCallback((): void => {
        setAcceptSteps([makeStep('Approve token'), makeStep('Block confirmation'), makeStep('Accept offer')]);
        setAccepting(false);
        setAcceptError(null);
        setAcceptingOfferId(null);
    }, []);

    const acceptOffer = useCallback(
        async (offer: Offer): Promise<boolean> => {
            if (walletAddress === null || walletAddress === undefined || network === null) {
                setAcceptError('Connect your wallet first');
                return false;
            }
            if (offer.status !== OFFER_STATUS.ACTIVE) {
                setAcceptError('This offer is no longer active');
                return false;
            }

            setAccepting(true);
            setAcceptError(null);
            setAcceptingOfferId(offer.id);
            setAcceptSteps([makeStep('Approve token'), makeStep('Block confirmation'), makeStep('Accept offer')]);

            const shortWanted = offer.wantedToken.length > 16 ? `${offer.wantedToken.slice(0, 10)}…${offer.wantedToken.slice(-4)}` : offer.wantedToken;
            const shortOffered = offer.offeredToken.length > 16 ? `${offer.offeredToken.slice(0, 10)}…${offer.offeredToken.slice(-4)}` : offer.offeredToken;

            const flowId = genFlowId();

            try {
                // Step 1: Approve wanted token (user signs)
                setAcceptStep(0, { status: 'pending' });

                let approveSkipped = false;
                let approveTxId = '';
                try {
                    approveTxId = await escrowService.approveWantedToken(
                        offer.wantedToken,
                        offer.wantedAmount,
                        walletAddress,
                        DEFAULT_FEE_RATE,
                    );
                } catch (approveErr) {
                    const errMsg = approveErr instanceof Error ? approveErr.message : String(approveErr);
                    if (errMsg.toLowerCase().includes('already active') || errMsg.toLowerCase().includes('already approved')) {
                        approveSkipped = true;
                    } else {
                        throw approveErr;
                    }
                }

                if (approveSkipped) {
                    setAcceptStep(0, { status: 'done' });
                    setAcceptStep(1, { status: 'done' });
                    toast('info', 'Approval already done', 'Skipping to final signature.');
                } else {
                    setAcceptStep(0, { status: 'done', txId: approveTxId });
                    addTxEntry('approve', offer.id, approveTxId, 'ok', `Approve ${shortWanted} — allowance for offer #${offer.id.toString()}`, walletAddress);

                    // Resolve token symbols + decimals for human-readable description
                    const [offSym, offDec, wantSym, wantDec] = await Promise.all([
                        escrowService.resolveTokenSymbol(offer.offeredToken),
                        escrowService.resolveTokenDecimals(offer.offeredToken),
                        escrowService.resolveTokenSymbol(offer.wantedToken),
                        escrowService.resolveTokenDecimals(offer.wantedToken),
                    ]);
                    const flowDesc = `Accept #${offer.id.toString()} — ${formatTokenAmount(offer.offeredAmount, offDec)} ${offSym} → ${formatTokenAmount(offer.wantedAmount, wantDec)} ${wantSym}`;

                    // Save pending flow to localStorage
                    addPendingFlow({
                        id: flowId,
                        type: 'accept',
                        stage: 'approved',
                        walletAddress,
                        approveTxId,
                        startedAt: Date.now(),
                        offerId: offer.id.toString(),
                        description: flowDesc,
                    });

                    // Step 2: Wait for block confirmation (automatic)
                    setAcceptStep(1, { status: 'pending' });
                    updateFlowStage(flowId, 'confirming');
                    await escrowService.waitForTransaction(approveTxId);
                    setAcceptStep(1, { status: 'done' });
                    updateFlowStage(flowId, 'ready');

                    // ── PAUSE: wait for user to click "Continue" ──
                    toast('info', 'Approval confirmed!', 'Click "Continue" on the form to sign the final transaction.', '#pending');
                    await waitForUserContinue();
                }

                // Step 3: Accept offer (user signs again)
                setAcceptStep(2, { status: 'pending' });
                const txId = await escrowService.acceptOffer(offer.id, walletAddress, DEFAULT_FEE_RATE);
                setAcceptStep(2, { status: 'done', txId });
                addTxEntry('accept', offer.id, txId, 'ok', `Accepted offer #${offer.id.toString()} — Swap ${shortOffered} for ${shortWanted}`, walletAddress);
                toast('success', 'Deal Accepted!', `Offer #${offer.id.toString()} — waiting for mempool confirmation.`, '#pending');

                // Move to finalizing — wait for mempool confirmation before removing
                updateFlowStage(flowId, 'finalizing', txId);
                escrowService.waitForTransaction(txId).then(() => {
                    removePendingFlow(flowId);
                }).catch(() => {
                    removePendingFlow(flowId);
                });

                void fetchOffers();
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Accept offer failed';
                setAcceptError(msg);
                addTxEntry('accept', offer.id, '', 'error', `Failed to accept offer #${offer.id.toString()}: ${msg}`, walletAddress);
                toast('error', 'Failed to accept deal', msg);
                setAcceptSteps((prev) =>
                    prev.map((s) => (s.status === 'pending' ? { ...s, status: 'error', error: msg } : s)),
                );
                // Don't remove the pending flow on error — user can resume later
                return false;
            } finally {
                setAccepting(false);
                setAwaitingContinue(false);
                continueResolverRef.current = null;
            }
        },
        [walletAddress, network, fetchOffers, toast],
    );

    // ── Resume flows (skip approve, go straight to finalize) ─────────────────

    const [resumingFlowId, setResumingFlowId] = useState<string | null>(null);
    const resumingFlowIdRef = useRef<string | null>(null);

    /** Kill any pending waitForUserContinue promise — prevents double-signature */
    const cancelPendingContinue = useCallback((): void => {
        continueResolverRef.current = null;
        setAwaitingContinue(false);
    }, []);

    const resumeCreateOffer = useCallback(
        async (flow: PendingFlow): Promise<bigint | null> => {
            // Guard: if already creating/accepting, block double-run
            if (resumingFlowIdRef.current !== null || creating || accepting) {
                return null;
            }
            if (walletAddress === null || walletAddress === undefined || network === null) {
                toast('error', 'Wallet not connected', 'Connect your wallet to resume.');
                return null;
            }
            if (flow.offeredToken === undefined || flow.offeredAmount === undefined ||
                flow.wantedToken === undefined || flow.wantedAmount === undefined) {
                toast('error', 'Invalid flow', 'Missing create parameters.');
                removePendingFlow(flow.id);
                return null;
            }

            // Kill any in-flight "Continue" promise from the original flow
            cancelPendingContinue();
            resumingFlowIdRef.current = flow.id;
            setResumingFlowId(flow.id);
            setCreating(true);
            setCreateError(null);
            // Show steps with approve + confirm already done
            setCreateSteps([
                { label: 'Approve token', status: 'done', txId: flow.approveTxId },
                { label: 'Block confirmation', status: 'done' },
                makeStep('Post offer'),
            ]);

            const shortOffer = flow.offeredToken.length > 16 ? `${flow.offeredToken.slice(0, 10)}…${flow.offeredToken.slice(-4)}` : flow.offeredToken;
            const shortWanted = flow.wantedToken.length > 16 ? `${flow.wantedToken.slice(0, 10)}…${flow.wantedToken.slice(-4)}` : flow.wantedToken;

            try {
                setCreateStep(2, { status: 'pending' });
                const { offerId, txId } = await escrowService.createOffer(
                    flow.offeredToken,
                    BigInt(flow.offeredAmount),
                    flow.wantedToken,
                    BigInt(flow.wantedAmount),
                    walletAddress,
                    DEFAULT_FEE_RATE,
                );
                setCreateStep(2, { status: 'done', txId });
                setLastCreatedId(offerId);
                addTxEntry('create', offerId, txId, 'ok', `Created offer #${offerId.toString()} — Sell ${shortOffer} for ${shortWanted}`, walletAddress);
                toast('success', 'Deal Posted!', `Offer #${offerId.toString()} — waiting for mempool confirmation.`, '#pending');

                updateFlowStage(flow.id, 'finalizing', txId);
                escrowService.waitForTransaction(txId).then(() => {
                    removePendingFlow(flow.id);
                }).catch(() => {
                    removePendingFlow(flow.id);
                });

                void fetchOffers();
                return offerId;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Resume create failed';
                setCreateError(msg);
                addTxEntry('create', null, '', 'error', `Failed to resume create: ${msg}`, walletAddress);
                toast('error', 'Failed to post deal', msg);
                setCreateSteps((prev) =>
                    prev.map((s) => (s.status === 'pending' ? { ...s, status: 'error', error: msg } : s)),
                );
                return null;
            } finally {
                setCreating(false);
                setResumingFlowId(null);
                resumingFlowIdRef.current = null;
            }
        },
        [walletAddress, network, fetchOffers, toast, creating, accepting, cancelPendingContinue],
    );

    const resumeAcceptOffer = useCallback(
        async (flow: PendingFlow): Promise<boolean> => {
            // Guard: if already creating/accepting, block double-run
            if (resumingFlowIdRef.current !== null || creating || accepting) {
                return false;
            }
            if (walletAddress === null || walletAddress === undefined || network === null) {
                toast('error', 'Wallet not connected', 'Connect your wallet to resume.');
                return false;
            }
            if (flow.offerId === undefined) {
                toast('error', 'Invalid flow', 'Missing offer ID.');
                removePendingFlow(flow.id);
                return false;
            }

            // Kill any in-flight "Continue" promise from the original flow
            cancelPendingContinue();
            resumingFlowIdRef.current = flow.id;
            setResumingFlowId(flow.id);
            setAccepting(true);
            setAcceptError(null);
            const offerId = BigInt(flow.offerId);
            setAcceptingOfferId(offerId);
            // Show steps with approve + confirm already done
            setAcceptSteps([
                { label: 'Approve token', status: 'done', txId: flow.approveTxId },
                { label: 'Block confirmation', status: 'done' },
                makeStep('Accept offer'),
            ]);

            try {
                setAcceptStep(2, { status: 'pending' });
                const txId = await escrowService.acceptOffer(offerId, walletAddress, DEFAULT_FEE_RATE);
                setAcceptStep(2, { status: 'done', txId });
                addTxEntry('accept', offerId, txId, 'ok', `Accepted offer #${offerId.toString()} (resumed)`, walletAddress);
                toast('success', 'Deal Accepted!', `Offer #${offerId.toString()} — waiting for mempool confirmation.`, '#pending');

                updateFlowStage(flow.id, 'finalizing', txId);
                escrowService.waitForTransaction(txId).then(() => {
                    removePendingFlow(flow.id);
                }).catch(() => {
                    removePendingFlow(flow.id);
                });

                void fetchOffers();
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Resume accept failed';
                setAcceptError(msg);
                addTxEntry('accept', offerId, '', 'error', `Failed to resume accept #${offerId.toString()}: ${msg}`, walletAddress);
                toast('error', 'Failed to accept deal', msg);
                setAcceptSteps((prev) =>
                    prev.map((s) => (s.status === 'pending' ? { ...s, status: 'error', error: msg } : s)),
                );
                return false;
            } finally {
                setAccepting(false);
                setResumingFlowId(null);
                resumingFlowIdRef.current = null;
            }
        },
        [walletAddress, network, fetchOffers, toast, creating, accepting, cancelPendingContinue],
    );

    // ── Cancel Offer ──────────────────────────────────────────────────────────

    const [cancelling, setCancelling] = useState<bigint | null>(null);
    const [cancelError, setCancelError] = useState<string | null>(null);

    const cancelOffer = useCallback(
        async (offer: Offer): Promise<boolean> => {
            if (walletAddress === null || walletAddress === undefined || network === null) return false;

            setCancelling(offer.id);
            setCancelError(null);
            try {
                const cancelTxId = await escrowService.cancelOffer(offer.id, walletAddress, DEFAULT_FEE_RATE);
                addTxEntry('cancel', offer.id, cancelTxId, 'ok', `Cancelled offer #${offer.id.toString()} — Tokens returned to wallet`, walletAddress);
                toast('success', 'Deal Cancelled', `Offer #${offer.id.toString()} has been cancelled. Tokens returned.`, '#pending');
                void fetchOffers();
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Cancel failed';
                setCancelError(msg);
                addTxEntry('cancel', offer.id, '', 'error', `Failed to cancel offer #${offer.id.toString()}: ${msg}`, walletAddress);
                toast('error', 'Failed to cancel deal', msg);
                return false;
            } finally {
                setCancelling(null);
            }
        },
        [walletAddress, network, fetchOffers, toast],
    );

    return {
        // State
        offers,
        myOffers,
        loadingOffers,
        offersError,

        // Create flow
        creating,
        createSteps,
        createError,
        lastCreatedId,
        createOffer,
        resetCreate,

        // Accept flow
        accepting,
        acceptSteps,
        acceptError,
        acceptingOfferId,
        acceptOffer,
        resetAccept,

        // Continue gate (shared between create/accept)
        awaitingContinue,
        confirmContinue,

        // Resume flows
        resumeCreateOffer,
        resumeAcceptOffer,
        resumingFlowId,

        // Cancel
        cancelling,
        cancelError,
        cancelOffer,

        // Refresh
        fetchOffers,
    };
}
