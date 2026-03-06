import { useState, useEffect } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { escrowService } from '../services/OTCEscrowService.js';
import { formatTokenAmount } from '../utils/tokenAmount.js';
import { OFFER_STATUS, type Offer, type TxStep } from '../types/index.js';
import { findTokenByAddress } from '../config/tokens.js';

const MEMPOOL_BASE = 'https://mempool.opnet.org/fr/testnet4';
const OPSCAN_BASE = 'https://opscan.org';
const OPSCAN_NET = 'op_testnet';

function shortAddr(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Estimate a human-readable date from a Bitcoin block number.
 *  OPNet testnet started ~Jan 2026 at block 0. Average block time ~10min.
 *  This is a rough estimate — exact timestamps require RPC lookup. */
function estimateBlockDate(blockNumber: number): string {
    // OPNet testnet genesis approx: Jan 15, 2026 00:00 UTC
    const BLOCK1_TS = 1771830206;
    const AVG_BLOCK_SECS = 166;
    const estimatedTs = BLOCK1_TS + (blockNumber - 1) * AVG_BLOCK_SECS;
    const date = new Date(estimatedTs * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let relative: string;
    if (diffMins < 1) relative = 'just now';
    else if (diffMins < 60) relative = `${diffMins.toString()}m ago`;
    else if (diffHours < 24) relative = `${diffHours.toString()}h ago`;
    else if (diffDays < 7) relative = `${diffDays.toString()}d ago`;
    else relative = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    return relative;
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

interface StatusBadgeProps {
    status: Offer['status'];
}

function StatusBadge({ status }: StatusBadgeProps): React.JSX.Element {
    const map = {
        [OFFER_STATUS.ACTIVE]: { label: 'Active', cls: 'offer-status--active' },
        [OFFER_STATUS.ACCEPTED]: { label: 'Accepted', cls: 'offer-status--accepted' },
        [OFFER_STATUS.CANCELLED]: { label: 'Cancelled', cls: 'offer-status--cancelled' },
    } as const;
    const entry = map[status as keyof typeof map] ?? { label: 'Unknown', cls: 'offer-status--active' };
    return <span className={`offer-status ${entry.cls}`}>{entry.label}</span>;
}

// ── Step progress (mini, for inside accept button area) ───────────────────────

interface MiniStepsProps {
    steps: TxStep[];
}

const MINI_STEP_HINTS: Record<string, string> = {
    'Approve token': 'Sign in wallet',
    'Block confirmation': 'Wait until the next block to finalize...',
    'Accept offer': 'Sign again in wallet',
};

function MiniSteps({ steps }: MiniStepsProps): React.JSX.Element {
    return (
        <div className="mini-steps">
            <div className="mini-steps__warning">
                Do not leave — 2 signatures required
            </div>
            {steps.map((s, i) => (
                <div
                    key={i}
                    className={[
                        'mini-step',
                        s.status === 'pending' ? 'mini-step--active' : '',
                        s.status === 'done' ? 'mini-step--done' : '',
                        s.status === 'error' ? 'mini-step--error' : '',
                    ]
                        .filter(Boolean)
                        .join(' ')}
                >
                    <span className="mini-step__dot" />
                    <span className="mini-step__label">{s.label}</span>
                    {s.status === 'pending' && (
                        <span className="mini-step__hint">
                            {MINI_STEP_HINTS[s.label] ?? 'Processing...'}
                        </span>
                    )}
                    {s.status === 'done' && s.txId !== undefined && (
                        <span className="mini-step__hint mini-step__hint--tx">
                            tx: {s.txId.slice(0, 8)}…
                            <button className="btn btn--ghost btn--xs" onClick={() => { void navigator.clipboard.writeText(s.txId as string); }} title="Copy TX ID">&#x29C9;</button>
                            <a
                                href={`https://mempool.opnet.org/fr/testnet4/tx/${s.txId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mini-step__tx-link"
                            >
                                Mempool
                            </a>
                            <a
                                href={`https://opscan.org/transactions/${s.txId}?network=op_testnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mini-step__tx-link"
                            >
                                OPScan
                            </a>
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

// ── OfferCard ─────────────────────────────────────────────────────────────────

interface OfferCardProps {
    offer: Offer;
    isMyOffer?: boolean;
    accepting: boolean;
    acceptingOfferId: bigint | null;
    acceptSteps: TxStep[];
    acceptError: string | null;
    awaitingContinue: boolean;
    cancelling: bigint | null;
    cancelError: string | null;
    onAccept: (offer: Offer) => void;
    onCancel: (offer: Offer) => void;
    onContinue: () => void;
}

export function OfferCard({
    offer,
    isMyOffer = false,
    accepting,
    acceptingOfferId,
    acceptSteps,
    acceptError,
    awaitingContinue,
    cancelling,
    cancelError,
    onAccept,
    onCancel,
    onContinue,
}: OfferCardProps): React.JSX.Element {
    const { walletAddress, network } = useWalletConnect();

    const offeredTokenInfo = network !== null ? findTokenByAddress(offer.offeredToken, network) : undefined;
    const wantedTokenInfo = network !== null ? findTokenByAddress(offer.wantedToken, network) : undefined;

    const [offeredSymbol, setOfferedSymbol] = useState<string>(shortAddr(offer.offeredToken));
    const [wantedSymbol, setWantedSymbol] = useState<string>(shortAddr(offer.wantedToken));
    const [offeredDecimals, setOfferedDecimals] = useState<number>(18);
    const [wantedDecimals, setWantedDecimals] = useState<number>(18);
    const [copied, setCopied] = useState(false);
    const [copiedOffered, setCopiedOffered] = useState(false);
    const [copiedWanted, setCopiedWanted] = useState(false);

    const copyCreator = (): void => {
        void navigator.clipboard.writeText(offer.creator).then(() => {
            setCopied(true);
            setTimeout(() => { setCopied(false); }, 2000);
        });
    };

    const copyOffered = (): void => {
        void navigator.clipboard.writeText(offer.offeredToken).then(() => {
            setCopiedOffered(true);
            setTimeout(() => { setCopiedOffered(false); }, 2000);
        });
    };

    const copyWanted = (): void => {
        void navigator.clipboard.writeText(offer.wantedToken).then(() => {
            setCopiedWanted(true);
            setTimeout(() => { setCopiedWanted(false); }, 2000);
        });
    };

    // Lazy-resolve token symbols and decimals
    useEffect(() => {
        let cancelled = false;

        void (async () => {
            const [sym, dec] = await Promise.all([
                escrowService.resolveTokenSymbol(offer.offeredToken),
                escrowService.resolveTokenDecimals(offer.offeredToken),
            ]);
            if (!cancelled) {
                setOfferedSymbol(sym);
                setOfferedDecimals(dec);
            }
        })();

        void (async () => {
            const [sym, dec] = await Promise.all([
                escrowService.resolveTokenSymbol(offer.wantedToken),
                escrowService.resolveTokenDecimals(offer.wantedToken),
            ]);
            if (!cancelled) {
                setWantedSymbol(sym);
                setWantedDecimals(dec);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [offer.offeredToken, offer.wantedToken]);

    const isThisAccepting = accepting && acceptingOfferId === offer.id;
    const isThisCancelling = cancelling === offer.id;
    const canAccept =
        offer.status === OFFER_STATUS.ACTIVE &&
        walletAddress !== null &&
        walletAddress !== undefined &&
        !isMyOffer;
    const canCancel = offer.status === OFFER_STATUS.ACTIVE && isMyOffer;

    return (
        <div
            className={[
                'offer-card',
                offer.status !== OFFER_STATUS.ACTIVE ? 'offer-card--inactive' : '',
                isMyOffer ? 'offer-card--mine' : '',
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {/* Header */}
            <div className="offer-card__header">
                <div className="offer-card__id">Deal #{offer.id.toString()}</div>
                <StatusBadge status={offer.status} />
            </div>

            {/* Swap visual */}
            <div className="offer-card__swap">
                <div className="offer-card__token">
                    {offeredTokenInfo?.icon !== undefined && (
                        <img className="offer-card__token-icon" src={offeredTokenInfo.icon} alt={offeredSymbol} />
                    )}
                    <span className="offer-card__token-symbol">{offeredSymbol}</span>
                    <span className="offer-card__token-amount">{formatTokenAmount(offer.offeredAmount, offeredDecimals)}</span>
                    <span className="offer-card__token-addr" title={offer.offeredToken}>
                        {shortAddr(offer.offeredToken)}
                        <button onClick={copyOffered} title={offer.offeredToken} className="offer-card__copy-btn">
                            {copiedOffered ? '✓' : '⧉'}
                        </button>
                    </span>
                </div>

                <div className="offer-card__arrow">
                    <span className="offer-card__arrow-icon">⚓</span>
                    <span className="offer-card__arrow-label">swap</span>
                </div>

                <div className="offer-card__token">
                    {wantedTokenInfo?.icon !== undefined && (
                        <img className="offer-card__token-icon" src={wantedTokenInfo.icon} alt={wantedSymbol} />
                    )}
                    <span className="offer-card__token-symbol">{wantedSymbol}</span>
                    <span className="offer-card__token-amount">{formatTokenAmount(offer.wantedAmount, wantedDecimals)}</span>
                    <span className="offer-card__token-addr" title={offer.wantedToken}>
                        {shortAddr(offer.wantedToken)}
                        <button onClick={copyWanted} title={offer.wantedToken} className="offer-card__copy-btn">
                            {copiedWanted ? '✓' : '⧉'}
                        </button>
                    </span>
                </div>
            </div>

            {/* Meta */}
            <div className="offer-card__meta">
                <span className="offer-card__creator">
                    by{' '}
                    <a
                        href={`${MEMPOOL_BASE}/address/${offer.creator}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="offer-card__link"
                        title={offer.creator}
                    >
                        {shortAddr(offer.creator)}
                    </a>
                    {isMyOffer && <span className="offer-card__you-badge"> (you)</span>}
                    <button
                        onClick={copyCreator}
                        title={offer.creator}
                        className="offer-card__copy-btn"
                    >
                        {copied ? '✓' : '⧉'}
                    </button>
                </span>
                <span className="offer-card__time" title={formatFullDate(offer.createdAt)}>
                    {estimateBlockDate(offer.createdAt)}
                </span>
            </div>

            {/* Explorer links */}
            <div className="offer-card__footer-row">
                <a
                    href={`${OPSCAN_BASE}/accounts/${offer.creator}?network=${OPSCAN_NET}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="offer-card__explorer-link"
                    title="View on OPScan"
                >
                    OPScan
                </a>
                <a
                    href={`${MEMPOOL_BASE}/address/${offer.creator}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="offer-card__explorer-link"
                    title="View on Mempool"
                >
                    Mempool
                </a>
            </div>

            {/* Actions */}
            {offer.status === OFFER_STATUS.ACTIVE && (
                <div className="offer-card__actions">
                    {canAccept && (
                        <div className="offer-card__accept-area">
                            {isThisAccepting ? (
                                <>
                                    <MiniSteps steps={acceptSteps} />
                                    {awaitingContinue && (
                                        <button
                                            id="continue-sign"
                                            className="btn btn--primary btn--full"
                                            onClick={onContinue}
                                            style={{ marginTop: '8px' }}
                                        >
                                            Continue — Final Signature
                                        </button>
                                    )}
                                </>
                            ) : (
                                <button
                                    className="btn btn--primary btn--full"
                                    onClick={() => { onAccept(offer); }}
                                    disabled={accepting}
                                >
                                    Accept Deal
                                </button>
                            )}
                            {isThisAccepting && acceptError !== null && (
                                <p className="offer-card__error">{acceptError}</p>
                            )}
                        </div>
                    )}

                    {canCancel && (
                        <button
                            className="btn btn--danger btn--full"
                            onClick={() => { onCancel(offer); }}
                            disabled={isThisCancelling}
                        >
                            {isThisCancelling ? (
                                <><span className="btn__spinner" /> Cancelling…</>
                            ) : (
                                'Cancel Deal'
                            )}
                        </button>
                    )}

                    {cancelError !== null && isMyOffer && cancelling === null && (
                        <p className="offer-card__error">{cancelError}</p>
                    )}
                </div>
            )}
        </div>
    );
}
