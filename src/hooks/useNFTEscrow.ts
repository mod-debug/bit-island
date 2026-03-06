import { useState, useEffect, useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { nftEscrowService } from '../services/NFTEscrowService.js';
import { getNFTEscrowAddress } from '../config/contracts.js';
import { useToast } from '../components/Toast.js';
import { NFT_OFFER_STATUS, NFT_OFFER_TYPE, type NftOffer, type TxStep, type CreateNftOfferParams } from '../types/index.js';
import { addTxEntry } from '../stores/txHistoryStore.js';
import {
    addPendingFlow,
    updateFlowStage,
    removePendingFlow,
    usePendingFlows,
    type PendingFlow,
} from '../stores/pendingFlowStore.js';

const DEFAULT_FEE_RATE = 10;

function makeStep(label: string): TxStep {
    return { label, status: 'idle' };
}

function genFlowId(): string {
    return `nft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Human-readable label for offer type */
function offerTypeLabel(t: number): string {
    if (t === NFT_OFFER_TYPE.NFT_FOR_NFT) return 'NFT for NFT';
    if (t === NFT_OFFER_TYPE.NFT_FOR_TOKEN) return 'NFT for Token';
    return 'Token for NFT';
}

export function useNFTEscrow() {
    const { walletAddress, network } = useWalletConnect();
    const { toast } = useToast();

    const [nftOffers, setNftOffers] = useState<NftOffer[]>([]);
    const [myNftOffers, setMyNftOffers] = useState<NftOffer[]>([]);
    const [loadingNftOffers, setLoadingNftOffers] = useState(false);
    const [nftOffersError, setNftOffersError] = useState<string | null>(null);

    const pendingFlows = usePendingFlows();

    // Initialize service
    useEffect(() => {
        if (network === null) return;
        try {
            const address = getNFTEscrowAddress(network);
            nftEscrowService.initialize(address, network);
        } catch { /* not deployed yet */ }
    }, [network, walletAddress]);

    // Fetch all NFT offers
    const fetchNftOffers = useCallback(async (): Promise<void> => {
        if (network === null) return;
        setLoadingNftOffers(true);
        setNftOffersError(null);
        try {
            const contractAddress = getNFTEscrowAddress(network);
            nftEscrowService.initialize(contractAddress, network);
            const all = await nftEscrowService.getAllOffers();
            setNftOffers(all);
            if (walletAddress !== null && walletAddress !== undefined) {
                const myLower = walletAddress.toLowerCase();
                setMyNftOffers(all.filter((o) => o.creator.toLowerCase() === myLower));
            } else {
                setMyNftOffers([]);
            }
        } catch (err) {
            setNftOffersError(err instanceof Error ? err.message : 'Failed to fetch NFT offers');
        } finally {
            setLoadingNftOffers(false);
        }
    }, [network, walletAddress]);

    // Auto-fetch
    useEffect(() => {
        void fetchNftOffers();
    }, [fetchNftOffers]);

    // ── Mount recovery: poll pending flows ──
    useEffect(() => {
        if (network === null || walletAddress === null || walletAddress === undefined) return;
        const walletLower = walletAddress.toLowerCase();
        const myFlows = pendingFlows.filter(
            (f) => f.walletAddress.toLowerCase() === walletLower && (f.type === 'nft-create' || f.type === 'nft-accept'),
        );
        if (myFlows.length === 0) return;

        let cancelled = false;

        for (const flow of myFlows) {
            if (flow.stage === 'approved' || flow.stage === 'confirming') {
                if (flow.stage === 'approved') updateFlowStage(flow.id, 'confirming');
                void (async () => {
                    try {
                        await nftEscrowService.waitForTransaction(flow.approveTxId);
                        if (!cancelled) updateFlowStage(flow.id, 'ready');
                    } catch {
                        if (!cancelled) updateFlowStage(flow.id, 'ready');
                    }
                })();
            } else if (flow.stage === 'finalizing' && flow.finalizeTxId !== undefined) {
                void (async () => {
                    try { await nftEscrowService.waitForTransaction(flow.finalizeTxId as string); } catch { /* ignore */ }
                    if (!cancelled) removePendingFlow(flow.id);
                })();
            }
        }

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [network, walletAddress]);

    // ── Continue gate ──
    const [awaitingContinue, setAwaitingContinue] = useState(false);
    const continueResolverRef = useRef<(() => void) | null>(null);
    const resumingFlowIdRef = useRef<string | null>(null);

    const confirmContinue = useCallback((): void => {
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

    // ── Create NFT Offer (3-step flow) ──
    const [createSteps, setCreateSteps] = useState<TxStep[]>([
        makeStep('Approve asset'),
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
        setCreateSteps([makeStep('Approve asset'), makeStep('Block confirmation'), makeStep('Post offer')]);
        setCreating(false);
        creatingRef.current = false;
        setCreateError(null);
        setLastCreatedId(null);
        setAwaitingContinue(false);
        continueResolverRef.current = null;
    }, []);

    const createNftOffer = useCallback(
        async (params: CreateNftOfferParams): Promise<bigint | null> => {
            if (creatingRef.current) return null;
            if (walletAddress === null || walletAddress === undefined || network === null) {
                setCreateError('Connect your wallet first');
                return null;
            }

            creatingRef.current = true;
            setCreating(true);
            setCreateError(null);
            setCreateSteps([makeStep('Approve asset'), makeStep('Block confirmation'), makeStep('Post offer')]);

            const flowId = genFlowId();
            const typeLabel = offerTypeLabel(params.offerType);

            try {
                // Step 1: Approve the offered asset
                setCreateStep(0, { status: 'pending' });

                let approveSkipped = false;
                let approveTxId = '';
                try {
                    if (params.offerType === NFT_OFFER_TYPE.NFT_FOR_NFT || params.offerType === NFT_OFFER_TYPE.NFT_FOR_TOKEN) {
                        approveTxId = await nftEscrowService.approveNft(
                            params.offeredCollection,
                            params.offeredTokenId,
                            walletAddress,
                            DEFAULT_FEE_RATE,
                        );
                    } else {
                        approveTxId = await nftEscrowService.approveToken(
                            params.offeredCollection,
                            params.offeredAmount,
                            walletAddress,
                            DEFAULT_FEE_RATE,
                        );
                    }
                } catch (approveErr) {
                    const errMsg = approveErr instanceof Error ? approveErr.message : String(approveErr);
                    if (errMsg.toLowerCase().includes('already active') || errMsg.toLowerCase().includes('already approved')) {
                        approveSkipped = true;
                    } else {
                        throw approveErr;
                    }
                }

                if (approveSkipped) {
                    // Asset already approved from a previous attempt — skip to post offer
                    setCreateStep(0, { status: 'done' });
                    setCreateStep(1, { status: 'done' });
                    toast('info', 'Approval already done', 'Skipping to final signature.');
                } else {
                    setCreateStep(0, { status: 'done', txId: approveTxId });
                    addTxEntry('approve', null, approveTxId, 'ok', `Approve ${typeLabel} offer`, walletAddress);

                    // Save pending flow
                    addPendingFlow({
                        id: flowId,
                        type: 'nft-create',
                        stage: 'approved',
                        walletAddress,
                        approveTxId,
                        startedAt: Date.now(),
                        nftOfferType: params.offerType,
                        nftCollection: params.offeredCollection,
                        nftTokenId: params.offeredTokenId.toString(),
                        nftWantedCollection: params.wantedCollection,
                        nftWantedTokenId: params.wantedTokenId.toString(),
                        nftWantedAmount: params.wantedAmount.toString(),
                        nftOfferedAmount: params.offeredAmount.toString(),
                        description: `${typeLabel} offer`,
                    });

                    // Step 2: Wait for block confirmation
                    setCreateStep(1, { status: 'pending' });
                    updateFlowStage(flowId, 'confirming');
                    await nftEscrowService.waitForTransaction(approveTxId);
                    setCreateStep(1, { status: 'done' });
                    updateFlowStage(flowId, 'ready');

                    // Pause for user
                    toast('info', 'Approval confirmed!', 'Click "Continue" on the form to sign the final transaction.', '#pending');
                    await waitForUserContinue();
                }

                // Step 3: Create offer
                setCreateStep(2, { status: 'pending' });
                const { offerId, txId } = await nftEscrowService.createOffer(
                    params.offerType,
                    params.offeredCollection,
                    params.offeredTokenId,
                    params.offeredAmount,
                    params.wantedCollection,
                    params.wantedTokenId,
                    params.wantedAmount,
                    walletAddress,
                    DEFAULT_FEE_RATE,
                );
                setCreateStep(2, { status: 'done', txId });
                setLastCreatedId(offerId);
                addTxEntry('create', offerId, txId, 'ok', `Created ${typeLabel} offer #${offerId.toString()}`, walletAddress);
                toast('success', 'NFT Deal Posted!', `Offer #${offerId.toString()} is live.`, '#pending');

                updateFlowStage(flowId, 'finalizing', txId);
                nftEscrowService.waitForTransaction(txId).then(() => removePendingFlow(flowId)).catch(() => removePendingFlow(flowId));

                void fetchNftOffers();
                return offerId;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Create NFT offer failed';
                setCreateError(msg);
                addTxEntry('create', null, '', 'error', `Failed: ${msg}`, walletAddress);
                toast('error', 'Failed to create NFT deal', msg);
                setCreateSteps((prev) => prev.map((s) => (s.status === 'pending' ? { ...s, status: 'error', error: msg } : s)));
                return null;
            } finally {
                creatingRef.current = false;
                setCreating(false);
                setAwaitingContinue(false);
                continueResolverRef.current = null;
            }
        },
        [walletAddress, network, fetchNftOffers, toast],
    );

    // ── Accept NFT Offer (3-step flow) ──
    const [acceptSteps, setAcceptSteps] = useState<TxStep[]>([
        makeStep('Approve asset'),
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
        setAcceptSteps([makeStep('Approve asset'), makeStep('Block confirmation'), makeStep('Accept offer')]);
        setAccepting(false);
        setAcceptError(null);
        setAcceptingOfferId(null);
    }, []);

    const acceptNftOffer = useCallback(
        async (offer: NftOffer, acceptorTokenId: bigint): Promise<boolean> => {
            if (walletAddress === null || walletAddress === undefined || network === null) {
                setAcceptError('Connect your wallet first');
                return false;
            }
            if (offer.status !== NFT_OFFER_STATUS.ACTIVE) {
                setAcceptError('This offer is no longer active');
                return false;
            }

            setAccepting(true);
            setAcceptError(null);
            setAcceptingOfferId(offer.id);
            setAcceptSteps([makeStep('Approve asset'), makeStep('Block confirmation'), makeStep('Accept offer')]);

            const flowId = genFlowId();
            const typeLabel = offerTypeLabel(offer.offerType);

            try {
                // Step 1: Approve the wanted asset
                setAcceptStep(0, { status: 'pending' });

                let approveSkipped = false;
                let approveTxId = '';
                try {
                    if (offer.offerType === NFT_OFFER_TYPE.NFT_FOR_NFT || offer.offerType === NFT_OFFER_TYPE.TOKEN_FOR_NFT) {
                        approveTxId = await nftEscrowService.approveNft(
                            offer.wantedCollection,
                            acceptorTokenId,
                            walletAddress,
                            DEFAULT_FEE_RATE,
                        );
                    } else {
                        approveTxId = await nftEscrowService.approveToken(
                            offer.wantedCollection,
                            offer.wantedAmount,
                            walletAddress,
                            DEFAULT_FEE_RATE,
                        );
                    }
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
                    addTxEntry('approve', offer.id, approveTxId, 'ok', `Approve for accepting ${typeLabel} #${offer.id.toString()}`, walletAddress);

                    addPendingFlow({
                        id: flowId,
                        type: 'nft-accept',
                        stage: 'approved',
                        walletAddress,
                        approveTxId,
                        startedAt: Date.now(),
                        offerId: offer.id.toString(),
                        nftOfferType: offer.offerType,
                        nftTokenId: acceptorTokenId.toString(),
                        description: `Accept ${typeLabel} #${offer.id.toString()}`,
                    });

                    // Step 2: Wait for block confirmation
                    setAcceptStep(1, { status: 'pending' });
                    updateFlowStage(flowId, 'confirming');
                    await nftEscrowService.waitForTransaction(approveTxId);
                    setAcceptStep(1, { status: 'done' });
                    updateFlowStage(flowId, 'ready');

                    toast('info', 'Approval confirmed!', 'Click "Continue" on the card to sign the final transaction.', '#pending');
                    await waitForUserContinue();
                }

                // Step 3: Accept offer
                setAcceptStep(2, { status: 'pending' });
                const txId = await nftEscrowService.acceptOffer(offer.id, acceptorTokenId, walletAddress, DEFAULT_FEE_RATE);
                setAcceptStep(2, { status: 'done', txId });
                addTxEntry('accept', offer.id, txId, 'ok', `Accepted ${typeLabel} #${offer.id.toString()}`, walletAddress);
                toast('success', 'NFT Deal Accepted!', `Offer #${offer.id.toString()} completed.`, '#pending');

                updateFlowStage(flowId, 'finalizing', txId);
                nftEscrowService.waitForTransaction(txId).then(() => removePendingFlow(flowId)).catch(() => removePendingFlow(flowId));

                void fetchNftOffers();
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Accept NFT offer failed';
                setAcceptError(msg);
                addTxEntry('accept', offer.id, '', 'error', `Failed: ${msg}`, walletAddress);
                toast('error', 'Failed to accept NFT deal', msg);
                setAcceptSteps((prev) => prev.map((s) => (s.status === 'pending' ? { ...s, status: 'error', error: msg } : s)));
                return false;
            } finally {
                setAccepting(false);
                setAwaitingContinue(false);
                continueResolverRef.current = null;
            }
        },
        [walletAddress, network, fetchNftOffers, toast],
    );

    // ── Cancel NFT Offer ──
    const [cancelling, setCancelling] = useState<bigint | null>(null);
    const [cancelError, setCancelError] = useState<string | null>(null);

    const cancelNftOffer = useCallback(
        async (offer: NftOffer): Promise<boolean> => {
            if (walletAddress === null || walletAddress === undefined || network === null) return false;

            setCancelling(offer.id);
            setCancelError(null);
            try {
                const cancelTxId = await nftEscrowService.cancelOffer(offer.id, walletAddress, DEFAULT_FEE_RATE);
                addTxEntry('cancel', offer.id, cancelTxId, 'ok', `Cancelled NFT offer #${offer.id.toString()}`, walletAddress);
                toast('success', 'NFT Deal Cancelled', `Offer #${offer.id.toString()} cancelled. Asset returned.`, '#pending');
                void fetchNftOffers();
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Cancel failed';
                setCancelError(msg);
                addTxEntry('cancel', offer.id, '', 'error', `Failed to cancel #${offer.id.toString()}: ${msg}`, walletAddress);
                toast('error', 'Failed to cancel NFT deal', msg);
                return false;
            } finally {
                setCancelling(null);
            }
        },
        [walletAddress, network, fetchNftOffers, toast],
    );

    // ── Resume flows ──
    const [resumingFlowId, setResumingFlowId] = useState<string | null>(null);

    const cancelPendingContinue = useCallback((): void => {
        continueResolverRef.current = null;
        setAwaitingContinue(false);
    }, []);

    const resumeNftCreateOffer = useCallback(
        async (flow: PendingFlow): Promise<bigint | null> => {
            if (resumingFlowIdRef.current !== null || creating || accepting) return null;
            if (walletAddress === null || walletAddress === undefined || network === null) {
                toast('error', 'Wallet not connected', 'Connect your wallet to resume.');
                return null;
            }

            cancelPendingContinue();
            resumingFlowIdRef.current = flow.id;
            setResumingFlowId(flow.id);
            setCreating(true);
            setCreateError(null);
            setCreateSteps([
                { label: 'Approve asset', status: 'done', txId: flow.approveTxId },
                { label: 'Block confirmation', status: 'done' },
                makeStep('Post offer'),
            ]);

            try {
                setCreateStep(2, { status: 'pending' });
                const { offerId, txId } = await nftEscrowService.createOffer(
                    flow.nftOfferType ?? 0,
                    flow.nftCollection ?? '',
                    BigInt(flow.nftTokenId ?? '0'),
                    BigInt(flow.nftOfferedAmount ?? '0'),
                    flow.nftWantedCollection ?? '',
                    BigInt(flow.nftWantedTokenId ?? '0'),
                    BigInt(flow.nftWantedAmount ?? '0'),
                    walletAddress,
                    DEFAULT_FEE_RATE,
                );
                setCreateStep(2, { status: 'done', txId });
                setLastCreatedId(offerId);
                addTxEntry('create', offerId, txId, 'ok', `Created NFT offer #${offerId.toString()} (resumed)`, walletAddress);
                toast('success', 'NFT Deal Posted!', `Offer #${offerId.toString()} is live.`, '#pending');

                updateFlowStage(flow.id, 'finalizing', txId);
                nftEscrowService.waitForTransaction(txId).then(() => removePendingFlow(flow.id)).catch(() => removePendingFlow(flow.id));

                void fetchNftOffers();
                return offerId;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Resume create failed';
                setCreateError(msg);
                toast('error', 'Failed to post NFT deal', msg);
                setCreateSteps((prev) => prev.map((s) => (s.status === 'pending' ? { ...s, status: 'error', error: msg } : s)));
                return null;
            } finally {
                setCreating(false);
                setResumingFlowId(null);
                resumingFlowIdRef.current = null;
            }
        },
        [walletAddress, network, fetchNftOffers, toast, creating, accepting, cancelPendingContinue],
    );

    const resumeNftAcceptOffer = useCallback(
        async (flow: PendingFlow): Promise<boolean> => {
            if (resumingFlowIdRef.current !== null || creating || accepting) return false;
            if (walletAddress === null || walletAddress === undefined || network === null) {
                toast('error', 'Wallet not connected', 'Connect your wallet to resume.');
                return false;
            }
            if (flow.offerId === undefined) {
                removePendingFlow(flow.id);
                return false;
            }

            cancelPendingContinue();
            resumingFlowIdRef.current = flow.id;
            setResumingFlowId(flow.id);
            setAccepting(true);
            setAcceptError(null);
            const offerId = BigInt(flow.offerId);
            setAcceptingOfferId(offerId);
            setAcceptSteps([
                { label: 'Approve asset', status: 'done', txId: flow.approveTxId },
                { label: 'Block confirmation', status: 'done' },
                makeStep('Accept offer'),
            ]);

            try {
                setAcceptStep(2, { status: 'pending' });
                const txId = await nftEscrowService.acceptOffer(
                    offerId,
                    BigInt(flow.nftTokenId ?? '0'),
                    walletAddress,
                    DEFAULT_FEE_RATE,
                );
                setAcceptStep(2, { status: 'done', txId });
                addTxEntry('accept', offerId, txId, 'ok', `Accepted NFT offer #${offerId.toString()} (resumed)`, walletAddress);
                toast('success', 'NFT Deal Accepted!', `Offer #${offerId.toString()} completed.`, '#pending');

                updateFlowStage(flow.id, 'finalizing', txId);
                nftEscrowService.waitForTransaction(txId).then(() => removePendingFlow(flow.id)).catch(() => removePendingFlow(flow.id));

                void fetchNftOffers();
                return true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Resume accept failed';
                setAcceptError(msg);
                toast('error', 'Failed to accept NFT deal', msg);
                setAcceptSteps((prev) => prev.map((s) => (s.status === 'pending' ? { ...s, status: 'error', error: msg } : s)));
                return false;
            } finally {
                setAccepting(false);
                setResumingFlowId(null);
                resumingFlowIdRef.current = null;
            }
        },
        [walletAddress, network, fetchNftOffers, toast, creating, accepting, cancelPendingContinue],
    );

    return {
        nftOffers,
        myNftOffers,
        loadingNftOffers,
        nftOffersError,

        creating,
        createSteps,
        createError,
        lastCreatedId,
        createNftOffer,
        resetCreate,

        accepting,
        acceptSteps,
        acceptError,
        acceptingOfferId,
        acceptNftOffer,
        resetAccept,

        awaitingContinue,
        confirmContinue,

        resumeNftCreateOffer,
        resumeNftAcceptOffer,
        resumingFlowId,

        cancelling,
        cancelError,
        cancelNftOffer,

        fetchNftOffers,
    };
}
