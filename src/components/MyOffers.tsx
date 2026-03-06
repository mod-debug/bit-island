import { useState, useEffect } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useOTCEscrow } from '../hooks/useOTCEscrow.js';
import { OfferCard } from './OfferCard.js';
import { OFFER_STATUS, type Offer } from '../types/index.js';
import { escrowService } from '../services/OTCEscrowService.js';
import { formatTokenAmount } from '../utils/tokenAmount.js';
import { getTxIdForDeal } from '../stores/txHistoryStore.js';

const MEMPOOL_BASE = 'https://mempool.opnet.org/fr/testnet4';
const OPSCAN_BASE = 'https://opscan.org';
const OPSCAN_NET = 'op_testnet';

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

export function MyOffers(): React.JSX.Element {
    const { walletAddress, openConnectModal } = useWalletConnect();
    const {
        myOffers,
        loadingOffers,
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
    } = useOTCEscrow();

    if (walletAddress === null || walletAddress === undefined) {
        return (
            <section className="otc-section" id="my-offers">
                <div className="section-header">
                    <div className="section-tag">My Deals</div>
                    <h2 className="section-title">
                        Your <span className="text-accent">Deals</span>
                    </h2>
                </div>
                <div className="offers-empty">
                    <span className="offers-empty__icon">🔐</span>
                    <p className="offers-empty__text">Connect your wallet to see your deals.</p>
                    <button className="btn btn--primary" onClick={openConnectModal}>
                        Connect Wallet
                    </button>
                </div>
            </section>
        );
    }

    const activeMyOffers = myOffers.filter((o) => o.status === OFFER_STATUS.ACTIVE);
    const closedMyOffers = myOffers.filter((o) => o.status !== OFFER_STATUS.ACTIVE);

    return (
        <section className="otc-section otc-section--accent" id="my-offers">
            <div className="section-header">
                <div className="section-tag">My Deals</div>
                <h2 className="section-title">
                    Your <span className="text-accent">Deals</span>
                </h2>
                <p className="section-sub">
                    All offers you have created. Cancel active ones to get your tokens back.
                </p>
            </div>

            {loadingOffers && myOffers.length === 0 && (
                <div className="offers-empty">
                    <span className="spinner spinner--lg" />
                </div>
            )}

            {!loadingOffers && myOffers.length === 0 && (
                <div className="offers-empty">
                    <span className="offers-empty__icon">📜</span>
                    <p className="offers-empty__text">No deals yet.</p>
                    <p className="offers-empty__sub">Post your first deal in Bit OTC Escrow above.</p>
                    <a href="#create" className="btn btn--primary">Post a Deal</a>
                </div>
            )}

            {activeMyOffers.length > 0 && (
                <>
                    <div className="offers-subsection-label">Active ({activeMyOffers.length})</div>
                    <div className="offers-grid">
                        {activeMyOffers.map((offer) => (
                            <OfferCard
                                key={offer.id.toString()}
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
                    </div>
                </>
            )}

            {closedMyOffers.length > 0 && (
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

        </section>
    );
}
