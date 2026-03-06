import { useState, useMemo, useEffect } from 'react';
import { useOTCEscrow } from '../hooks/useOTCEscrow.js';
import { useNFTEscrow } from '../hooks/useNFTEscrow.js';
import { OfferCard } from './OfferCard.js';
import { NftOfferCard } from './NftOfferCard.js';
import { OFFER_STATUS, NFT_OFFER_STATUS } from '../types/index.js';
import type { Offer, TxHistoryEntry } from '../types/index.js';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { escrowService } from '../services/OTCEscrowService.js';
import { findTokenByAddress, getKnownTokens } from '../config/tokens.js';
import { formatTokenAmount } from '../utils/tokenAmount.js';
import { getTxIdForDeal, useTxHistory } from '../stores/txHistoryStore.js';
import { ADMIN_WALLET } from '../config/contracts.js';
import {
    usePendingFlows,
    hasPendingFlowForTx,
    removePendingFlow,
    type PendingFlow,
} from '../stores/pendingFlowStore.js';

type StatusFilter = 'all' | 'active' | 'closed';
type DealTypeFilter = 'all' | 'token' | 'nft';
type SortMode = 'newest' | 'oldest';
type MainTab = 'market' | 'yours' | 'history' | 'admin';

const MEMPOOL_BASE = 'https://mempool.opnet.org/fr/testnet4';
const OPSCAN_BASE = 'https://opscan.org';
const OPSCAN_NET = 'op_testnet';

/* ─── TX History helpers ─── */

const ACTION_LABELS: Record<string, { text: string; cls: string }> = {
    approve: { text: 'Approve', cls: 'tx-action--approve' },
    create: { text: 'Create', cls: 'tx-action--create' },
    accept: { text: 'Accept', cls: 'tx-action--accept' },
    cancel: { text: 'Cancel', cls: 'tx-action--cancel' },
};

function formatTxTime(ts: number): string {
    const date = new Date(ts);
    return date.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function shortTxId(txId: string): string {
    if (txId.length <= 16) return txId;
    return `${txId.slice(0, 8)}…${txId.slice(-6)}`;
}

/** Format a relative time string like "2m ago", "1h ago" */
function formatTimeAgo(ts: number): string {
    const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Detect orphaned approve entries in tx history.
 * An approve is "orphaned" if no corresponding create/accept with status 'ok'
 * exists after it in the timeline.
 *
 * - Accept approves (dealId !== null): orphaned if no 'accept' with same dealId
 * - Create approves (dealId === null): orphaned if no 'create' with timestamp > approve's
 */
function computeOrphanedApproveIds(history: TxHistoryEntry[]): Set<number> {
    const orphaned = new Set<number>();

    // Collect all successful create/accept entries
    const successfulAcceptDealIds = new Set<string>();
    const latestCreateTs: number[] = [];

    for (const e of history) {
        if (e.status !== 'ok') continue;
        if (e.action === 'accept' && e.dealId !== null) {
            successfulAcceptDealIds.add(e.dealId.toString());
        }
        if (e.action === 'create') {
            latestCreateTs.push(e.timestamp);
        }
    }

    for (const e of history) {
        if (e.action !== 'approve' || e.status !== 'ok') continue;

        if (e.dealId !== null) {
            // Accept approve: orphaned if no matching accept
            if (!successfulAcceptDealIds.has(e.dealId.toString())) {
                orphaned.add(e.id);
            }
        } else {
            // Create approve: orphaned if no create entry after this approve
            const hasCreate = latestCreateTs.some((ts) => ts >= e.timestamp);
            if (!hasCreate) {
                orphaned.add(e.id);
            }
        }
    }

    return orphaned;
}

interface TxHistoryRowProps {
    entry: TxHistoryEntry;
    isOrphaned: boolean;
    onGoToPending?: () => void;
    onGoToCreate?: () => void;
}

function TxHistoryRow({ entry, isOrphaned, onGoToPending, onGoToCreate }: TxHistoryRowProps): React.JSX.Element {
    const actionInfo = ACTION_LABELS[entry.action] ?? { text: entry.action, cls: '' };
    const [copied, setCopied] = useState(false);

    // Show resume button: either has a pending flow in store, or is an orphaned approve from history
    const hasPending = entry.action === 'approve' && entry.status === 'ok' && entry.txId.length > 0 && hasPendingFlowForTx(entry.txId);
    const showResume = hasPending || isOrphaned;

    // Determine which action to take: accept orphans → pending tab, create orphans → create form
    const isAcceptOrphan = entry.dealId !== null;

    const handleResume = (): void => {
        if (hasPending && onGoToPending !== undefined) {
            onGoToPending();
        } else if (isAcceptOrphan && onGoToPending !== undefined) {
            // For accept orphans, go to pending/market to find the offer
            onGoToPending();
        } else if (onGoToCreate !== undefined) {
            // For create orphans, scroll to the create form
            onGoToCreate();
        }
    };

    const copyTxId = (): void => {
        void navigator.clipboard.writeText(entry.txId).then(() => {
            setCopied(true);
            setTimeout(() => { setCopied(false); }, 2000);
        });
    };

    return (
        <tr className={`tx-row ${entry.status === 'error' ? 'tx-row--error' : ''} ${isOrphaned ? 'tx-row--orphaned' : ''}`}>
            <td className="tx-row__time">{formatTxTime(entry.timestamp)}</td>
            <td className="tx-row__action-cell">
                <span className={`tx-row__action ${entry.status === 'error' ? 'tx-action--failed' : actionInfo.cls}`}>{actionInfo.text}</span>
                {isOrphaned && <span className="tx-row__orphan-tag">Not finalized</span>}
            </td>
            <td className="tx-row__deal">
                {entry.dealId !== null ? `#${entry.dealId.toString()}` : '—'}
            </td>
            <td className="tx-row__detail">{entry.detail}</td>
            <td className="tx-row__txid">
                {entry.txId.length > 0 ? (
                    <span className="tx-row__txid-wrap">
                        <code title={entry.txId}>{shortTxId(entry.txId)}</code>
                        <button onClick={copyTxId} className="tx-row__copy" title="Copy full TX ID">
                            {copied ? '\u2713' : '\u29C9'}
                        </button>
                    </span>
                ) : (
                    <span className="tx-row__na">—</span>
                )}
            </td>
            <td className="tx-row__links">
                {entry.txId.length > 0 && (
                    <>
                        <a
                            href={`${OPSCAN_BASE}/transactions/${entry.txId}?network=${OPSCAN_NET}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View on OPScan"
                        >
                            OPScan
                        </a>
                        <a
                            href={`${MEMPOOL_BASE}/tx/${entry.txId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View on Mempool"
                        >
                            Mempool
                        </a>
                    </>
                )}
            </td>
            <td className="tx-row__status-icon">
                {showResume ? (
                    <button
                        className="btn btn--accent btn--xs pending-flow__resume-link"
                        onClick={handleResume}
                        title={isAcceptOrphan ? 'Accept this deal — allowance already set' : 'Post your offer — allowance already set'}
                    >
                        {isAcceptOrphan ? 'Accept Offer' : 'Post Offer'}
                    </button>
                ) : (
                    entry.status === 'ok' ? '\u2713' : '\u2717'
                )}
            </td>
        </tr>
    );
}

/* ─── Shared helpers ─── */

function shortAddr(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatFullDate(blockNumber: number): string {
    const BLOCK1_TS = 1771830206;
    const AVG_BLOCK_SECS = 166;
    const estimatedTs = BLOCK1_TS + (blockNumber - 1) * AVG_BLOCK_SECS;
    const date = new Date(estimatedTs * 1000);
    return date.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

const STATUS_LABELS: Record<number, { text: string; cls: string }> = {
    [OFFER_STATUS.ACCEPTED]: { text: 'Accepted', cls: 'closed-row__status--accepted' },
    [OFFER_STATUS.CANCELLED]: { text: 'Cancelled', cls: 'closed-row__status--cancelled' },
};

interface ClosedOfferRowProps {
    offer: Offer;
}

function ClosedOfferRow({ offer }: ClosedOfferRowProps): React.JSX.Element {
    const [offeredSym, setOfferedSym] = useState(shortAddr(offer.offeredToken));
    const [wantedSym, setWantedSym] = useState(shortAddr(offer.wantedToken));
    const [offeredDec, setOfferedDec] = useState(18);
    const [wantedDec, setWantedDec] = useState(18);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const [sym, dec] = await Promise.all([
                escrowService.resolveTokenSymbol(offer.offeredToken),
                escrowService.resolveTokenDecimals(offer.offeredToken),
            ]);
            if (!cancelled) { setOfferedSym(sym); setOfferedDec(dec); }
        })();
        void (async () => {
            const [sym, dec] = await Promise.all([
                escrowService.resolveTokenSymbol(offer.wantedToken),
                escrowService.resolveTokenDecimals(offer.wantedToken),
            ]);
            if (!cancelled) { setWantedSym(sym); setWantedDec(dec); }
        })();
        return () => { cancelled = true; };
    }, [offer.offeredToken, offer.wantedToken]);

    const statusInfo = STATUS_LABELS[offer.status] ?? { text: 'Unknown', cls: '' };
    const txId = getTxIdForDeal(offer.id);

    return (
        <tr className="closed-row">
            <td className="closed-row__id">#{offer.id.toString()}</td>
            <td className="closed-row__swap">
                <span className="closed-row__amount">{formatTokenAmount(offer.offeredAmount, offeredDec)}</span>
                {' '}
                <span className="closed-row__symbol">{offeredSym}</span>
                <span className="closed-row__arrow">&rarr;</span>
                <span className="closed-row__amount">{formatTokenAmount(offer.wantedAmount, wantedDec)}</span>
                {' '}
                <span className="closed-row__symbol">{wantedSym}</span>
            </td>
            <td className={`closed-row__status ${statusInfo.cls}`}>{statusInfo.text}</td>
            <td className="closed-row__date" title={formatFullDate(offer.createdAt)}>
                {formatFullDate(offer.createdAt)}
            </td>
            <td className="closed-row__links">
                {txId !== null ? (
                    <>
                        <a
                            href={`${OPSCAN_BASE}/transactions/${txId}?network=${OPSCAN_NET}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View transaction on OPScan"
                        >
                            OPScan
                        </a>
                        <a
                            href={`${MEMPOOL_BASE}/tx/${txId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View transaction on Mempool"
                        >
                            Mempool
                        </a>
                    </>
                ) : (
                    <>
                        <a
                            href={`${OPSCAN_BASE}/accounts/${offer.creator}?network=${OPSCAN_NET}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View creator on OPScan"
                        >
                            OPScan
                        </a>
                        <a
                            href={`${MEMPOOL_BASE}/address/${offer.creator}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View creator on Mempool"
                        >
                            Mempool
                        </a>
                    </>
                )}
            </td>
        </tr>
    );
}

const ADMIN_STATUS_LABELS: Record<number, { text: string; cls: string }> = {
    [OFFER_STATUS.ACTIVE]: { text: 'Created', cls: 'tx-action--create' },
    [OFFER_STATUS.ACCEPTED]: { text: 'Accepted', cls: 'tx-action--accept' },
    [OFFER_STATUS.CANCELLED]: { text: 'Cancelled', cls: 'tx-action--cancel' },
};

interface AdminRowProps {
    offer: Offer;
}

function AdminCopyBtn({ text }: { readonly text: string }): React.JSX.Element {
    const [copied, setCopied] = useState(false);
    const copy = (): void => {
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => { setCopied(false); }, 2000);
        });
    };
    return (
        <button
            className="offer-card__copy-btn"
            onClick={copy}
            title={copied ? 'Copied!' : 'Copy address'}
            type="button"
        >
            {copied ? '\u2705' : '\uD83D\uDCCB'}
        </button>
    );
}

function AdminRow({ offer }: AdminRowProps): React.JSX.Element {
    const [offeredSym, setOfferedSym] = useState(shortAddr(offer.offeredToken));
    const [wantedSym, setWantedSym] = useState(shortAddr(offer.wantedToken));
    const [offeredDec, setOfferedDec] = useState(18);
    const [wantedDec, setWantedDec] = useState(18);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const [sym, dec] = await Promise.all([
                escrowService.resolveTokenSymbol(offer.offeredToken),
                escrowService.resolveTokenDecimals(offer.offeredToken),
            ]);
            if (!cancelled) { setOfferedSym(sym); setOfferedDec(dec); }
        })();
        void (async () => {
            const [sym, dec] = await Promise.all([
                escrowService.resolveTokenSymbol(offer.wantedToken),
                escrowService.resolveTokenDecimals(offer.wantedToken),
            ]);
            if (!cancelled) { setWantedSym(sym); setWantedDec(dec); }
        })();
        return () => { cancelled = true; };
    }, [offer.offeredToken, offer.wantedToken]);

    const actionInfo = ADMIN_STATUS_LABELS[offer.status] ?? { text: 'Unknown', cls: '' };
    const txId = getTxIdForDeal(offer.id);

    return (
        <tr className="tx-row">
            <td className="tx-row__time">{formatFullDate(offer.createdAt)}</td>
            <td className="tx-row__detail" title={offer.creator}>
                <code className="admin-row__wallet">{shortAddr(offer.creator)}</code>
                <AdminCopyBtn text={offer.creator} />
            </td>
            <td className="tx-row__detail" title={offer.acceptor.length > 0 ? offer.acceptor : undefined}>
                {offer.acceptor.length > 0 ? (
                    <>
                        <code className="admin-row__wallet admin-row__wallet--buyer">{shortAddr(offer.acceptor)}</code>
                        <AdminCopyBtn text={offer.acceptor} />
                    </>
                ) : (
                    <span className="tx-row__na">&mdash;</span>
                )}
            </td>
            <td className="tx-row__action-cell">
                <span className={`tx-row__action ${actionInfo.cls}`}>{actionInfo.text}</span>
            </td>
            <td className="tx-row__deal">#{offer.id.toString()}</td>
            <td className="closed-row__swap">
                <span className="closed-row__amount">{formatTokenAmount(offer.offeredAmount, offeredDec)}</span>
                {' '}
                <span className="closed-row__symbol">{offeredSym}</span>
            </td>
            <td className="closed-row__swap">
                <span className="closed-row__amount">{formatTokenAmount(offer.wantedAmount, wantedDec)}</span>
                {' '}
                <span className="closed-row__symbol">{wantedSym}</span>
            </td>
            <td className="tx-row__links">
                {txId !== null ? (
                    <>
                        <a
                            href={`${OPSCAN_BASE}/transactions/${txId}?network=${OPSCAN_NET}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View on OPScan"
                        >
                            OPScan
                        </a>
                        <a
                            href={`${MEMPOOL_BASE}/tx/${txId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View on Mempool"
                        >
                            Mempool
                        </a>
                    </>
                ) : (
                    <>
                        <a
                            href={`${OPSCAN_BASE}/accounts/${offer.creator}?network=${OPSCAN_NET}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View creator on OPScan"
                        >
                            OPScan
                        </a>
                        <a
                            href={`${MEMPOOL_BASE}/address/${offer.creator}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View creator on Mempool"
                        >
                            Mempool
                        </a>
                    </>
                )}
            </td>
        </tr>
    );
}

/* ─── Pending flow row ─── */

const STAGE_LABELS: Record<string, { text: string; cls: string }> = {
    approved: { text: 'Approved', cls: 'pending-flow__stage--approved' },
    confirming: { text: 'Confirming', cls: 'pending-flow__stage--confirming' },
    ready: { text: 'Ready', cls: 'pending-flow__stage--ready' },
    finalizing: { text: 'Finalizing', cls: 'pending-flow__stage--finalizing' },
};

interface PendingFlowRowProps {
    flow: PendingFlow;
    onContinue: (flow: PendingFlow) => void;
    onDismiss: (flowId: string) => void;
    isResuming: boolean;
}

function PendingFlowRow({ flow, onContinue, onDismiss, isResuming }: PendingFlowRowProps): React.JSX.Element {
    const stageInfo = STAGE_LABELS[flow.stage] ?? { text: flow.stage, cls: '' };
    const canContinue = flow.stage === 'ready' && !isResuming;
    const isFinalizing = flow.stage === 'finalizing';
    const displayTxId = isFinalizing && flow.finalizeTxId !== undefined ? flow.finalizeTxId : flow.approveTxId;
    const [txCopied, setTxCopied] = useState(false);

    const copyTx = (): void => {
        void navigator.clipboard.writeText(displayTxId).then(() => {
            setTxCopied(true);
            setTimeout(() => { setTxCopied(false); }, 2000);
        });
    };

    return (
        <tr className="pending-flow">
            <td className="pending-flow__time">{formatTimeAgo(flow.startedAt)}</td>
            <td className="pending-flow__type">
                <span className={`tx-row__action ${flow.type === 'create' || flow.type === 'nft-create' ? 'tx-action--create' : 'tx-action--accept'}`}>
                    {flow.type === 'nft-create' ? 'NFT Create' : flow.type === 'nft-accept' ? 'NFT Accept' : flow.type === 'create' ? 'Create' : 'Accept'}
                </span>
            </td>
            <td className="pending-flow__desc">
                {flow.description ?? '—'}
            </td>
            <td className="pending-flow__stage-cell">
                <span className={`pending-flow__stage ${stageInfo.cls}`}>
                    {(flow.stage === 'confirming' || isFinalizing) && <span className="btn__spinner" />}
                    {stageInfo.text}
                </span>
            </td>
            <td className="pending-flow__txid">
                <span className="tx-row__txid-wrap">
                    <code title={displayTxId}>{shortTxId(displayTxId)}</code>
                    <button onClick={copyTx} className="tx-row__copy" title="Copy full TX ID">
                        {txCopied ? '\u2713' : '\u29C9'}
                    </button>
                    <a
                        href={`https://opscan.org/transactions/${displayTxId}?network=op_testnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pending-flow__links"
                        title="View on OPScan"
                    >
                        OPScan
                    </a>
                </span>
            </td>
            <td className="pending-flow__actions">
                {isFinalizing ? (
                    <span className="pending-flow__wait-label">Waiting for confirmation...</span>
                ) : (
                    <button
                        className="btn btn--primary btn--xs"
                        disabled={!canContinue}
                        onClick={() => { onContinue(flow); }}
                        title={canContinue ? 'Resume and finalize this transaction' : 'Waiting for block confirmation...'}
                    >
                        {isResuming ? <><span className="btn__spinner" /> Signing...</> : 'Continue'}
                    </button>
                )}
                <button
                    className="btn btn--ghost btn--xs"
                    onClick={() => { onDismiss(flow.id); }}
                    title="Remove from pending (tokens stay in allowance)"
                    disabled={isResuming}
                >
                    Dismiss
                </button>
            </td>
        </tr>
    );
}


export function OffersList(): React.JSX.Element {
    const { walletAddress, network, openConnectModal } = useWalletConnect();
    const {
        offers,
        myOffers,
        loadingOffers,
        offersError,
        fetchOffers,
        accepting,
        acceptSteps,
        acceptError,
        acceptingOfferId,
        awaitingContinue,
        confirmContinue,
        cancelling,
        cancelError,
        acceptOffer,
        cancelOffer,
        resumeCreateOffer,
        resumeAcceptOffer,
        resumingFlowId,
    } = useOTCEscrow();
    const nftEscrow = useNFTEscrow();
    const txHistory = useTxHistory();
    const allPendingFlows = usePendingFlows();

    const [mainTab, setMainTab] = useState<MainTab>('market');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
    const [dealTypeFilter, setDealTypeFilter] = useState<DealTypeFilter>('all');
    const [sortMode, setSortMode] = useState<SortMode>('newest');

    /* Admin tab state */
    const [adminWalletFilter, setAdminWalletFilter] = useState('');
    const [adminTokenFilter, setAdminTokenFilter] = useState('all');

    const walletConnected = walletAddress !== null && walletAddress !== undefined;

    /* Pending flows for current wallet */
    const walletPendingFlows = useMemo(() => {
        if (!walletConnected) return [];
        return allPendingFlows.filter(
            (f) => f.walletAddress.toLowerCase() === walletAddress.toLowerCase(),
        );
    }, [allPendingFlows, walletAddress, walletConnected]);

    /** Resolve a token address to its symbol for search matching */
    const tokenSymbolMap = useMemo(() => {
        if (network === null) return new Map<string, string>();
        const map = new Map<string, string>();
        for (const offer of offers) {
            for (const addr of [offer.offeredToken, offer.wantedToken]) {
                if (!map.has(addr.toLowerCase())) {
                    const info = findTokenByAddress(addr, network);
                    if (info !== undefined) {
                        map.set(addr.toLowerCase(), info.symbol.toLowerCase());
                    }
                }
            }
        }
        return map;
    }, [offers, network]);

    /** Filtered + sorted offers (Market tab) */
    const filteredOffers = useMemo(() => {
        let result = [...offers];

        // Status filter
        if (statusFilter === 'active') {
            result = result.filter((o) => o.status === OFFER_STATUS.ACTIVE);
        } else if (statusFilter === 'closed') {
            result = result.filter((o) => o.status !== OFFER_STATUS.ACTIVE);
        }

        // Search by token symbol or address
        if (search.trim() !== '') {
            const q = search.trim().toLowerCase();
            result = result.filter((o) => {
                if (o.offeredToken.toLowerCase().includes(q)) return true;
                if (o.wantedToken.toLowerCase().includes(q)) return true;
                const offSym = tokenSymbolMap.get(o.offeredToken.toLowerCase());
                if (offSym !== undefined && offSym.includes(q)) return true;
                const wantSym = tokenSymbolMap.get(o.wantedToken.toLowerCase());
                if (wantSym !== undefined && wantSym.includes(q)) return true;
                if (o.id.toString().includes(q)) return true;
                if (o.creator.toLowerCase().includes(q)) return true;
                return false;
            });
        }

        // Sort
        if (sortMode === 'oldest') {
            result.reverse();
        }

        return result;
    }, [offers, statusFilter, search, sortMode, tokenSymbolMap]);

    /** Filtered NFT offers for market tab */
    const filteredNftOffers = useMemo(() => {
        let result = [...nftEscrow.nftOffers];
        if (statusFilter === 'active') {
            result = result.filter((o) => o.status === NFT_OFFER_STATUS.ACTIVE);
        } else if (statusFilter === 'closed') {
            result = result.filter((o) => o.status !== NFT_OFFER_STATUS.ACTIVE);
        }
        if (sortMode === 'oldest') result.reverse();
        return result;
    }, [nftEscrow.nftOffers, statusFilter, sortMode]);

    const totalActiveCount = offers.filter((o) => o.status === OFFER_STATUS.ACTIVE).length + nftEscrow.nftOffers.filter((o) => o.status === NFT_OFFER_STATUS.ACTIVE).length;
    const totalClosedCount = offers.filter((o) => o.status !== OFFER_STATUS.ACTIVE).length + nftEscrow.nftOffers.filter((o) => o.status !== NFT_OFFER_STATUS.ACTIVE).length;
    const totalCount = offers.length + nftEscrow.nftOffers.length;

    const isMyOffer = (offer: Offer): boolean =>
        walletAddress !== null &&
        walletAddress !== undefined &&
        offer.creator.toLowerCase() === walletAddress.toLowerCase();

    // Your Deals derived data
    const activeMyOffers = myOffers.filter((o) => o.status === OFFER_STATUS.ACTIVE);
    const closedMyOffers = myOffers.filter((o) => o.status !== OFFER_STATUS.ACTIVE);

    // Lazy-resolve symbols for search (trigger metadata fetch)
    useMemo(() => {
        for (const offer of offers) {
            void escrowService.resolveTokenSymbol(offer.offeredToken);
            void escrowService.resolveTokenSymbol(offer.wantedToken);
        }
    }, [offers]);

    const isAdmin = walletConnected && walletAddress.toLowerCase() === ADMIN_WALLET.toLowerCase();

    /* Known tokens for admin filter dropdown */
    const knownTokens = useMemo(() => {
        if (network === null) return [];
        return getKnownTokens(network);
    }, [network]);

    /* Filtered offers for Admin tab */
    const adminOffers = useMemo(() => {
        let result = [...offers];

        // Wallet filter
        if (adminWalletFilter.trim() !== '') {
            const q = adminWalletFilter.trim().toLowerCase();
            result = result.filter((o) => o.creator.toLowerCase().includes(q));
        }

        // Token filter
        if (adminTokenFilter !== 'all') {
            const tokenAddr = adminTokenFilter.toLowerCase();
            result = result.filter(
                (o) =>
                    o.offeredToken.toLowerCase() === tokenAddr ||
                    o.wantedToken.toLowerCase() === tokenAddr,
            );
        }

        // Newest first
        result.sort((a, b) => b.createdAt - a.createdAt);
        return result;
    }, [offers, adminWalletFilter, adminTokenFilter]);

    /* Pending flow handlers */
    const handleResume = (flow: PendingFlow): void => {
        if (flow.type === 'nft-create') {
            void nftEscrow.resumeNftCreateOffer(flow);
        } else if (flow.type === 'nft-accept') {
            void nftEscrow.resumeNftAcceptOffer(flow);
        } else if (flow.type === 'create') {
            void resumeCreateOffer(flow);
        } else {
            void resumeAcceptOffer(flow);
        }
    };

    const handleDismiss = (flowId: string): void => {
        removePendingFlow(flowId);
    };

    const goToPending = (): void => {
        const el = document.getElementById('pending-section');
        if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // goToPending is used by orphan detection UI


    const goToCreate = (): void => {
        const el = document.getElementById('create');
        if (el !== null) el.scrollIntoView({ behavior: 'smooth' });
    };

    /* Detect orphaned approve entries (approve without a subsequent finalize) */
    const orphanedApproveIds = useMemo(() => computeOrphanedApproveIds(txHistory), [txHistory]);

    return (
        <section className="otc-section otc-section--dark" id="browse">
            <div className="section-header">
                <div className="section-tag">The Docks</div>
                <h2 className="section-title">
                    Market<span className="text-accent">place</span>
                </h2>
                <p className="section-sub">
                    All active trades on the island. Find your match and execute the swap in two clicks.
                </p>
            </div>

            <div className="marketplace-panel">

            {/* ═══ PENDING BANNER (above marketplace) ═══ */}
            {walletConnected && walletPendingFlows.length > 0 && (
                <div className="vest-pending-banner" style={{ marginBottom: '1.5rem' }}>
                    <span className="vest-pending-banner__spinner" />
                    <div className="vest-pending-banner__text">
                        <strong>PENDING — {walletPendingFlows.length} operation{walletPendingFlows.length > 1 ? 's' : ''} in progress</strong>
                        <p>These transactions are waiting for block confirmation. Do not close the page.</p>
                    </div>
                    {(() => {
                        const firstTx = walletPendingFlows[0]?.finalizeTxId ?? walletPendingFlows[0]?.approveTxId;
                        if (firstTx === undefined || firstTx === '') return null;
                        return (
                            <a
                                className="vest-pending-banner__link"
                                href={`https://opscan.org/transactions/${firstTx}?network=op_testnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                View Transaction &rarr;
                            </a>
                        );
                    })()}
                </div>
            )}

            {/* Main tab bar */}
            <div className="deals-tabs">
                <button
                    className={`deals-tab ${mainTab === 'market' ? 'deals-tab--active' : ''}`}
                    onClick={() => { setMainTab('market'); }}
                >
                    Marketplace
                </button>
                <button
                    className={`deals-tab ${mainTab === 'yours' ? 'deals-tab--active' : ''}`}
                    onClick={() => { setMainTab('yours'); }}
                >
                    My Deals
                    {walletConnected && myOffers.length > 0 && (
                        <span className="deals-tab__badge">{myOffers.length}</span>
                    )}
                </button>
                {/* Pending tab removed — standalone section below */}
                <button
                    className={`deals-tab ${mainTab === 'history' ? 'deals-tab--active' : ''}`}
                    onClick={() => { setMainTab('history'); }}
                >
                    My Activity
                    {walletConnected && txHistory.length > 0 && (
                        <span className="deals-tab__badge">{txHistory.length}</span>
                    )}
                </button>
                {isAdmin && (
                    <button
                        className={`deals-tab deals-tab--admin ${mainTab === 'admin' ? 'deals-tab--active' : ''}`}
                        onClick={() => { setMainTab('admin'); }}
                    >
                        Admin
                        <span className="deals-tab__badge">{offers.length}</span>
                    </button>
                )}
            </div>

            {/* ═══ MARKET TAB ═══ */}
            {mainTab === 'market' && (
                <>
                    {/* Filter toolbar */}
                    <div className="filter-toolbar">
                        <input
                            className="filter-toolbar__search"
                            type="text"
                            placeholder="Search by token, address, or deal #..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); }}
                        />
                        <div className="filter-toolbar__group">
                            <button
                                className={`filter-chip ${statusFilter === 'active' ? 'filter-chip--active' : ''}`}
                                onClick={() => { setStatusFilter('active'); }}
                            >
                                Active ({totalActiveCount})
                            </button>
                            <button
                                className={`filter-chip ${statusFilter === 'closed' ? 'filter-chip--active' : ''}`}
                                onClick={() => { setStatusFilter('closed'); }}
                            >
                                Closed ({totalClosedCount})
                            </button>
                            <button
                                className={`filter-chip ${statusFilter === 'all' ? 'filter-chip--active' : ''}`}
                                onClick={() => { setStatusFilter('all'); }}
                            >
                                All ({totalCount})
                            </button>
                            <span className="filter-toolbar__separator" />
                            <button
                                className={`filter-chip ${dealTypeFilter === 'all' ? 'filter-chip--active' : ''}`}
                                onClick={() => { setDealTypeFilter('all'); }}
                            >
                                All Types
                            </button>
                            <button
                                className={`filter-chip ${dealTypeFilter === 'token' ? 'filter-chip--active' : ''}`}
                                onClick={() => { setDealTypeFilter('token'); }}
                            >
                                Token Deals
                            </button>
                            <button
                                className={`filter-chip ${dealTypeFilter === 'nft' ? 'filter-chip--active' : ''}`}
                                onClick={() => { setDealTypeFilter('nft'); }}
                            >
                                NFT Deals
                            </button>
                        </div>
                        <select
                            className="filter-toolbar__sort"
                            value={sortMode}
                            onChange={(e) => { setSortMode(e.target.value as SortMode); }}
                        >
                            <option value="newest">Newest first</option>
                            <option value="oldest">Oldest first</option>
                        </select>
                        <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => { void fetchOffers(); void nftEscrow.fetchNftOffers(); }}
                            disabled={loadingOffers || nftEscrow.loadingNftOffers}
                        >
                            {loadingOffers || nftEscrow.loadingNftOffers ? <><span className="btn__spinner" /> Refreshing...</> : 'Refresh'}
                        </button>
                    </div>

                    {/* Error */}
                    {offersError !== null && (
                        <div className="alert alert--error" style={{ maxWidth: 640, margin: '0 auto 24px' }}>
                            {offersError}
                        </div>
                    )}

                    {/* Loading skeleton */}
                    {loadingOffers && offers.length === 0 && (
                        <div className="offers-grid">
                            {[1, 2, 3].map((n) => (
                                <div key={n} className="offer-card offer-card--skeleton">
                                    <div className="skeleton-line skeleton-line--sm" />
                                    <div className="skeleton-swap">
                                        <div className="skeleton-token" />
                                        <div className="skeleton-arrow" />
                                        <div className="skeleton-token" />
                                    </div>
                                    <div className="skeleton-line skeleton-line--xs" />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Empty state */}
                    {!loadingOffers && filteredOffers.length === 0 && filteredNftOffers.length === 0 && offersError === null && (
                        <div className="offers-empty">
                            <span className="offers-empty__icon">🏴‍☠️</span>
                            {search.trim() !== '' ? (
                                <>
                                    <p className="offers-empty__text">No deals match &quot;{search}&quot;</p>
                                    <p className="offers-empty__sub">Try a different search or clear your filters.</p>
                                    <button className="btn btn--ghost" onClick={() => { setSearch(''); }}>
                                        Clear Search
                                    </button>
                                </>
                            ) : (
                                <>
                                    <p className="offers-empty__text">
                                        {statusFilter === 'active' ? 'No active deals on the docks.' : 'No closed deals yet.'}
                                    </p>
                                    <p className="offers-empty__sub">Be the first pirate to post a trade!</p>
                                    <a href="#create" className="btn btn--primary">Post a Deal</a>
                                </>
                            )}
                        </div>
                    )}

                    {/* Offers grid */}
                    {(filteredOffers.length > 0 || filteredNftOffers.length > 0) && (
                        <div className="offers-grid">
                            {(dealTypeFilter === 'all' || dealTypeFilter === 'token') && filteredOffers.map((offer) => (
                                <OfferCard
                                    key={`token-${offer.id.toString()}`}
                                    offer={offer}
                                    isMyOffer={isMyOffer(offer)}
                                    accepting={accepting}
                                    acceptingOfferId={acceptingOfferId}
                                    acceptSteps={acceptSteps}
                                    acceptError={acceptError}
                                    cancelling={cancelling}
                                    cancelError={cancelError}
                                    awaitingContinue={awaitingContinue}
                                    onAccept={(o) => { void acceptOffer(o); }}
                                    onCancel={(o) => { void cancelOffer(o); }}
                                    onContinue={confirmContinue}
                                />
                            ))}
                            {(dealTypeFilter === 'all' || dealTypeFilter === 'nft') && filteredNftOffers.map((offer) => (
                                <NftOfferCard
                                    key={`nft-${offer.id.toString()}`}
                                    offer={offer}
                                    isMyOffer={walletAddress !== null && walletAddress !== undefined && offer.creator.toLowerCase() === walletAddress.toLowerCase()}
                                    accepting={nftEscrow.accepting}
                                    acceptingOfferId={nftEscrow.acceptingOfferId}
                                    acceptSteps={nftEscrow.acceptSteps}
                                    acceptError={nftEscrow.acceptError}
                                    cancelling={nftEscrow.cancelling}
                                    cancelError={nftEscrow.cancelError}
                                    awaitingContinue={nftEscrow.awaitingContinue}
                                    onAccept={(o, tokenId) => { void nftEscrow.acceptNftOffer(o, tokenId); }}
                                    onCancel={(o) => { void nftEscrow.cancelNftOffer(o); }}
                                    onContinue={nftEscrow.confirmContinue}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ═══ YOUR DEALS TAB ═══ */}
            {mainTab === 'yours' && (
                <>
                    {!walletConnected && (
                        <div className="offers-empty">
                            <span className="offers-empty__icon">🔐</span>
                            <p className="offers-empty__text">Connect your wallet to see your deals.</p>
                            <button className="btn btn--primary" onClick={openConnectModal}>
                                Connect Wallet
                            </button>
                        </div>
                    )}

                    {walletConnected && loadingOffers && myOffers.length === 0 && (
                        <div className="offers-empty">
                            <span className="spinner spinner--lg" />
                        </div>
                    )}

                    {walletConnected && !loadingOffers && myOffers.length === 0 && nftEscrow.myNftOffers.length === 0 && (
                        <div className="offers-empty">
                            <span className="offers-empty__icon">📜</span>
                            <p className="offers-empty__text">No deals yet.</p>
                            <p className="offers-empty__sub">Post your first deal in Bit OTC Escrow above.</p>
                            <a href="#create" className="btn btn--primary">Post a Deal</a>
                        </div>
                    )}

                    {walletConnected && (activeMyOffers.length > 0 || nftEscrow.myNftOffers.filter((o) => o.status === NFT_OFFER_STATUS.ACTIVE).length > 0) && (
                        <>
                            <div className="offers-subsection-label">Active ({activeMyOffers.length + nftEscrow.myNftOffers.filter((o) => o.status === NFT_OFFER_STATUS.ACTIVE).length})</div>
                            <div className="offers-grid">
                                {activeMyOffers.map((offer) => (
                                    <OfferCard
                                        key={`token-${offer.id.toString()}`}
                                        offer={offer}
                                        isMyOffer={true}
                                        accepting={accepting}
                                        acceptingOfferId={acceptingOfferId}
                                        acceptSteps={acceptSteps}
                                        acceptError={acceptError}
                                        cancelling={cancelling}
                                        cancelError={cancelError}
                                        awaitingContinue={awaitingContinue}
                                        onAccept={(o) => { void acceptOffer(o); }}
                                        onCancel={(o) => { void cancelOffer(o); }}
                                        onContinue={confirmContinue}
                                    />
                                ))}
                                {nftEscrow.myNftOffers.filter((o) => o.status === NFT_OFFER_STATUS.ACTIVE).map((offer) => (
                                    <NftOfferCard
                                        key={`nft-${offer.id.toString()}`}
                                        offer={offer}
                                        isMyOffer={true}
                                        accepting={nftEscrow.accepting}
                                        acceptingOfferId={nftEscrow.acceptingOfferId}
                                        acceptSteps={nftEscrow.acceptSteps}
                                        acceptError={nftEscrow.acceptError}
                                        cancelling={nftEscrow.cancelling}
                                        cancelError={nftEscrow.cancelError}
                                        awaitingContinue={nftEscrow.awaitingContinue}
                                        onAccept={(o, tokenId) => { void nftEscrow.acceptNftOffer(o, tokenId); }}
                                        onCancel={(o) => { void nftEscrow.cancelNftOffer(o); }}
                                        onContinue={nftEscrow.confirmContinue}
                                    />
                                ))}
                            </div>
                        </>
                    )}

                    {walletConnected && closedMyOffers.length > 0 && (
                        <details className="closed-offers" open>
                            <summary className="closed-offers__summary">
                                Closed deals ({closedMyOffers.length})
                            </summary>
                            <div className="closed-table-wrap">
                                <table className="closed-table">
                                    <thead>
                                        <tr>
                                            <th>Deal</th>
                                            <th>Swap</th>
                                            <th>Status</th>
                                            <th>Date</th>
                                            <th>Explorer</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {closedMyOffers.map((offer) => (
                                            <ClosedOfferRow key={offer.id.toString()} offer={offer} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    )}
                </>
            )}

            {/* Pending tab content removed — standalone section below */}

            {/* ═══ HISTORY TAB ═══ */}
            {mainTab === 'history' && (
                <>
                    {!walletConnected && (
                        <div className="offers-empty">
                            <span className="offers-empty__icon">🔐</span>
                            <p className="offers-empty__text">Connect your wallet to see your history.</p>
                            <button className="btn btn--primary" onClick={openConnectModal}>
                                Connect Wallet
                            </button>
                        </div>
                    )}

                    {walletConnected && txHistory.length === 0 && (
                        <div className="offers-empty">
                            <span className="offers-empty__icon">📋</span>
                            <p className="offers-empty__text">No transactions yet.</p>
                            <p className="offers-empty__sub">Your transaction history will appear here after your first deal.</p>
                        </div>
                    )}

                    {walletConnected && txHistory.length > 0 && (
                        <div className="tx-history__table-wrap">
                            <table className="tx-history__table">
                                <thead>
                                    <tr>
                                        <th>Date / Time</th>
                                        <th>Action</th>
                                        <th>Deal</th>
                                        <th>Details</th>
                                        <th>TX ID</th>
                                        <th>Explorer</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {txHistory.map((entry) => (
                                        <TxHistoryRow
                                            key={entry.id}
                                            entry={entry}
                                            isOrphaned={orphanedApproveIds.has(entry.id)}
                                            onGoToPending={goToPending}
                                            onGoToCreate={goToCreate}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* ═══ ADMIN TAB ═══ */}
            {mainTab === 'admin' && isAdmin && (
                <>
                    <div className="admin-filters">
                        <input
                            className="admin-filters__wallet"
                            type="text"
                            placeholder="Filter by wallet address..."
                            value={adminWalletFilter}
                            onChange={(e) => { setAdminWalletFilter(e.target.value); }}
                        />
                        <select
                            className="admin-filters__token"
                            value={adminTokenFilter}
                            onChange={(e) => { setAdminTokenFilter(e.target.value); }}
                        >
                            <option value="all">All tokens</option>
                            {knownTokens.map((t) => (
                                <option key={t.address} value={t.address.toLowerCase()}>
                                    {t.symbol}
                                </option>
                            ))}
                        </select>
                        <span className="admin-filters__count">
                            {adminOffers.length} / {offers.length} offers
                        </span>
                    </div>

                    {loadingOffers && offers.length === 0 && (
                        <div className="offers-empty">
                            <span className="spinner spinner--lg" />
                        </div>
                    )}

                    {!loadingOffers && adminOffers.length === 0 && (
                        <div className="offers-empty">
                            <span className="offers-empty__icon">📋</span>
                            <p className="offers-empty__text">No matching offers.</p>
                            <p className="offers-empty__sub">Adjust your filters or wait for new on-chain activity.</p>
                        </div>
                    )}

                    {adminOffers.length > 0 && (
                        <div className="tx-history__table-wrap">
                            <table className="tx-history__table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Seller / Offeror</th>
                                        <th>Buyer</th>
                                        <th>Action</th>
                                        <th>Deal</th>
                                        <th>Offered</th>
                                        <th>Wanted</th>
                                        <th>Explorer</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {adminOffers.map((offer) => (
                                        <AdminRow key={offer.id.toString()} offer={offer} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
            {/* ═══ PENDING TABLE (below marketplace) ═══ */}
            {walletConnected && walletPendingFlows.length > 0 && (
                <div className="pending-standalone" id="pending-section">
                    <h3 className="pending-standalone__title">Pending Transactions</h3>
                    <div className="tx-history__table-wrap">
                        <table className="tx-history__table pending-flow__table">
                            <thead>
                                <tr>
                                    <th>Started</th>
                                    <th>Type</th>
                                    <th>Description</th>
                                    <th>Stage</th>
                                    <th>TX</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {walletPendingFlows.map((flow) => (
                                    <PendingFlowRow
                                        key={flow.id}
                                        flow={flow}
                                        onContinue={handleResume}
                                        onDismiss={handleDismiss}
                                        isResuming={resumingFlowId === flow.id || nftEscrow.resumingFlowId === flow.id}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            </div>{/* end marketplace-panel */}
        </section>
    );
}
