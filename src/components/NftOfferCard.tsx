import { useState, useEffect } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { nftEscrowService } from '../services/NFTEscrowService.js';
import { formatTokenAmount } from '../utils/tokenAmount.js';
import { NFT_OFFER_STATUS, NFT_OFFER_TYPE, type NftOffer, type TxStep } from '../types/index.js';
import { findCollectionByAddress } from '../config/nftCollections.js';
import { findTokenByAddress } from '../config/tokens.js';
import { NftTokenPicker } from './NftTokenPicker.js';
import { generateNftImage, collectionToSeed } from '../utils/generateNftImage.js';

const OPSCAN_BASE = 'https://opscan.org';
const OPSCAN_NET = 'op_testnet';

function shortAddr(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function estimateBlockDate(blockNumber: number): string {
    const BLOCK1_TS = 1771830206;
    const AVG_BLOCK_SECS = 166;
    const estimatedTs = BLOCK1_TS + (blockNumber - 1) * AVG_BLOCK_SECS;
    const date = new Date(estimatedTs * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins.toString()}m ago`;
    if (diffHours < 24) return `${diffHours.toString()}h ago`;
    if (diffDays < 7) return `${diffDays.toString()}d ago`;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Badge label and CSS class for each offer type */
function offerTypeBadge(t: number): { label: string; cls: string } {
    if (t === NFT_OFFER_TYPE.NFT_FOR_NFT) return { label: 'NFT \u2194 NFT', cls: 'nft-offer-badge--nft-nft' };
    if (t === NFT_OFFER_TYPE.NFT_FOR_TOKEN) return { label: 'NFT \u2192 Token', cls: 'nft-offer-badge--nft-token' };
    return { label: 'Token \u2192 NFT', cls: 'nft-offer-badge--token-nft' };
}

function StatusBadge({ status }: { status: number }): React.JSX.Element {
    const map: Record<number, { label: string; cls: string }> = {
        [NFT_OFFER_STATUS.ACTIVE]: { label: 'Active', cls: 'offer-status--active' },
        [NFT_OFFER_STATUS.ACCEPTED]: { label: 'Accepted', cls: 'offer-status--accepted' },
        [NFT_OFFER_STATUS.CANCELLED]: { label: 'Cancelled', cls: 'offer-status--cancelled' },
    };
    const entry = map[status] ?? { label: 'Unknown', cls: '' };
    return <span className={`offer-status ${entry.cls}`}>{entry.label}</span>;
}

/** Mini steps indicator for inline accept flow */
function MiniSteps({ steps }: { steps: TxStep[] }): React.JSX.Element {
    return (
        <div className="mini-steps">
            <div className="mini-steps__warning">Do not leave — 2 signatures required</div>
            {steps.map((s, i) => (
                <div
                    key={i}
                    className={['mini-step', s.status === 'pending' ? 'mini-step--active' : '', s.status === 'done' ? 'mini-step--done' : '', s.status === 'error' ? 'mini-step--error' : ''].filter(Boolean).join(' ')}
                >
                    <span className="mini-step__dot" />
                    <span className="mini-step__label">{s.label}</span>
                    {s.status === 'done' && s.txId !== undefined && (
                        <span className="mini-step__hint mini-step__hint--tx">
                            tx: {s.txId.slice(0, 8)}…
                            <button className="btn btn--ghost btn--xs" onClick={() => { void navigator.clipboard.writeText(s.txId as string); }} title="Copy TX ID">&#x29C9;</button>
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

interface NftOfferCardProps {
    offer: NftOffer;
    isMyOffer?: boolean;
    accepting: boolean;
    acceptingOfferId: bigint | null;
    acceptSteps: TxStep[];
    acceptError: string | null;
    awaitingContinue: boolean;
    cancelling: bigint | null;
    cancelError: string | null;
    onAccept: (offer: NftOffer, acceptorTokenId: bigint) => void;
    onCancel: (offer: NftOffer) => void;
    onContinue: () => void;
}

export function NftOfferCard({
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
}: NftOfferCardProps): React.JSX.Element {
    const { walletAddress, network } = useWalletConnect();

    const [offeredName, setOfferedName] = useState(shortAddr(offer.offeredCollection));
    const [wantedName, setWantedName] = useState(shortAddr(offer.wantedCollection));
    const [offeredDecimals, setOfferedDecimals] = useState(18);
    const [wantedDecimals, setWantedDecimals] = useState(18);
    const [acceptorTokenId, setAcceptorTokenId] = useState<bigint | null>(null);
    const [showPicker, setShowPicker] = useState(false);
    const [offeredImage, setOfferedImage] = useState<string | null>(null);
    const [wantedImage, setWantedImage] = useState<string | null>(null);

    // 3-tier NFT image resolution: tokenURI/IPFS → generative pixel art
    useEffect(() => {
        let cancelled = false;

        // Offered side — only if it's an NFT (not a token)
        if (offer.offerType !== NFT_OFFER_TYPE.TOKEN_FOR_NFT) {
            const seed = collectionToSeed(offer.offeredCollection);
            // Immediately set generative fallback
            setOfferedImage(generateNftImage(offer.offeredTokenId, seed));
            // Then try to resolve real image from chain/IPFS
            void (async () => {
                const url = await nftEscrowService.resolveNftImage(offer.offeredCollection, offer.offeredTokenId);
                if (!cancelled && url !== null) setOfferedImage(url);
            })();
        }

        // Wanted side — only if it's an NFT (not a token) and specific tokenId
        if (offer.offerType !== NFT_OFFER_TYPE.NFT_FOR_TOKEN && offer.wantedTokenId !== 0n) {
            const seed = collectionToSeed(offer.wantedCollection);
            setWantedImage(generateNftImage(offer.wantedTokenId, seed));
            void (async () => {
                const url = await nftEscrowService.resolveNftImage(offer.wantedCollection, offer.wantedTokenId);
                if (!cancelled && url !== null) setWantedImage(url);
            })();
        } else if (offer.offerType !== NFT_OFFER_TYPE.NFT_FOR_TOKEN && offer.wantedTokenId === 0n) {
            // "Any" NFT — generate a generic placeholder from collection seed
            setWantedImage(null);
        }

        return () => { cancelled = true; };
    }, [offer]);

    // Resolve collection/token names
    useEffect(() => {
        let cancelled = false;

        // Offered side
        if (offer.offerType === NFT_OFFER_TYPE.TOKEN_FOR_NFT) {
            void (async () => {
                const [sym, dec] = await Promise.all([
                    nftEscrowService.resolveTokenSymbol(offer.offeredCollection),
                    nftEscrowService.resolveTokenDecimals(offer.offeredCollection),
                ]);
                if (!cancelled) { setOfferedName(sym); setOfferedDecimals(dec); }
            })();
        } else {
            void (async () => {
                const name = await nftEscrowService.resolveCollectionName(offer.offeredCollection);
                if (!cancelled) setOfferedName(name);
            })();
        }

        // Wanted side
        if (offer.offerType === NFT_OFFER_TYPE.NFT_FOR_TOKEN) {
            void (async () => {
                const [sym, dec] = await Promise.all([
                    nftEscrowService.resolveTokenSymbol(offer.wantedCollection),
                    nftEscrowService.resolveTokenDecimals(offer.wantedCollection),
                ]);
                if (!cancelled) { setWantedName(sym); setWantedDecimals(dec); }
            })();
        } else {
            void (async () => {
                const name = await nftEscrowService.resolveCollectionName(offer.wantedCollection);
                if (!cancelled) setWantedName(name);
            })();
        }

        // Check known collections from registry
        if (network !== null) {
            const offInfo = findCollectionByAddress(offer.offeredCollection, network);
            if (offInfo !== undefined) setOfferedName(offInfo.name);
            const wantInfo = findCollectionByAddress(offer.wantedCollection, network);
            if (wantInfo !== undefined) setWantedName(wantInfo.name);
        }

        return () => { cancelled = true; };
    }, [offer, network]);

    const isThisAccepting = accepting && acceptingOfferId === offer.id;
    const isThisCancelling = cancelling === offer.id;
    const canAccept = offer.status === NFT_OFFER_STATUS.ACTIVE && walletAddress !== null && walletAddress !== undefined && !isMyOffer;
    const canCancel = offer.status === NFT_OFFER_STATUS.ACTIVE && isMyOffer;

    const typeBadge = offerTypeBadge(offer.offerType);

    /** Whether the acceptor needs to pick a tokenId (NFT side with wantedTokenId=0) */
    const needsTokenPick = (
        (offer.offerType === NFT_OFFER_TYPE.NFT_FOR_NFT || offer.offerType === NFT_OFFER_TYPE.TOKEN_FOR_NFT) &&
        offer.wantedTokenId === 0n
    );

    const handleAccept = (): void => {
        if (needsTokenPick && acceptorTokenId === null) {
            setShowPicker(true);
            return;
        }
        onAccept(offer, acceptorTokenId ?? offer.wantedTokenId);
    };

    const offeredTokenInfo = network !== null ? findTokenByAddress(offer.offeredCollection, network) : undefined;
    const wantedTokenInfo = network !== null ? findTokenByAddress(offer.wantedCollection, network) : undefined;

    /** Render the "offered" side */
    const renderOfferedSide = (): React.JSX.Element => {
        if (offer.offerType === NFT_OFFER_TYPE.TOKEN_FOR_NFT) {
            // Token side
            return (
                <div className="offer-card__token">
                    {offeredTokenInfo?.icon !== undefined && (
                        <img className="offer-card__token-icon" src={offeredTokenInfo.icon} alt={offeredName} />
                    )}
                    <span className="offer-card__token-symbol">{offeredName}</span>
                    <span className="offer-card__token-amount">{formatTokenAmount(offer.offeredAmount, offeredDecimals)}</span>
                    <span className="nft-offer-badge nft-offer-badge--op20">OP-20</span>
                </div>
            );
        }
        // NFT side
        return (
            <div className="offer-card__token offer-card__token--nft">
                {offeredImage !== null ? (
                    <img className="offer-card__nft-thumb" src={offeredImage} alt={`${offeredName} #${offer.offeredTokenId.toString()}`} />
                ) : (
                    <div className="offer-card__nft-placeholder">NFT</div>
                )}
                <span className="offer-card__nft-id">#{offer.offeredTokenId.toString()}</span>
                <span className="offer-card__token-symbol">{offeredName}</span>
                <span className="nft-offer-badge nft-offer-badge--op721">OP-721</span>
            </div>
        );
    };

    /** Render the "wanted" side */
    const renderWantedSide = (): React.JSX.Element => {
        if (offer.offerType === NFT_OFFER_TYPE.NFT_FOR_TOKEN) {
            // Token side
            return (
                <div className="offer-card__token">
                    {wantedTokenInfo?.icon !== undefined && (
                        <img className="offer-card__token-icon" src={wantedTokenInfo.icon} alt={wantedName} />
                    )}
                    <span className="offer-card__token-symbol">{wantedName}</span>
                    <span className="offer-card__token-amount">{formatTokenAmount(offer.wantedAmount, wantedDecimals)}</span>
                    <span className="nft-offer-badge nft-offer-badge--op20">OP-20</span>
                </div>
            );
        }
        // NFT side
        return (
            <div className="offer-card__token offer-card__token--nft">
                {wantedImage !== null ? (
                    <img className="offer-card__nft-thumb" src={wantedImage} alt={`${wantedName} #${offer.wantedTokenId.toString()}`} />
                ) : (
                    <div className="offer-card__nft-placeholder">
                        {offer.wantedTokenId === 0n ? '?' : 'NFT'}
                    </div>
                )}
                <span className="offer-card__nft-id">
                    {offer.wantedTokenId === 0n ? 'Any' : `#${offer.wantedTokenId.toString()}`}
                </span>
                <span className="offer-card__token-symbol">{wantedName}</span>
                <span className="nft-offer-badge nft-offer-badge--op721">OP-721</span>
            </div>
        );
    };

    return (
        <div className={['offer-card', offer.status !== NFT_OFFER_STATUS.ACTIVE ? 'offer-card--inactive' : '', isMyOffer ? 'offer-card--mine' : ''].filter(Boolean).join(' ')}>
            {/* Header */}
            <div className="offer-card__header">
                <div className="offer-card__id">
                    NFT Deal #{offer.id.toString()}
                    <span className={`nft-offer-badge ${typeBadge.cls}`}>{typeBadge.label}</span>
                </div>
                <StatusBadge status={offer.status} />
            </div>

            {/* Swap visual */}
            <div className="offer-card__swap">
                {renderOfferedSide()}
                <div className="offer-card__arrow">
                    <span className="offer-card__arrow-icon">⚓</span>
                    <span className="offer-card__arrow-label">swap</span>
                </div>
                {renderWantedSide()}
            </div>

            {/* Meta */}
            <div className="offer-card__meta">
                <span className="offer-card__creator">
                    by{' '}
                    <a
                        href={`${OPSCAN_BASE}/accounts/${offer.creator}?network=${OPSCAN_NET}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="offer-card__link"
                        title={offer.creator}
                    >
                        {shortAddr(offer.creator)}
                    </a>
                    {isMyOffer && <span className="offer-card__you-badge"> (you)</span>}
                </span>
                <span className="offer-card__time">{estimateBlockDate(offer.createdAt)}</span>
            </div>

            {/* NFT Token Picker for "any from collection" accept */}
            {showPicker && canAccept && needsTokenPick && (
                <div className="nft-offer-card__picker">
                    <NftTokenPicker
                        collectionAddress={offer.wantedCollection}
                        selectedTokenId={acceptorTokenId}
                        onSelect={(id) => { setAcceptorTokenId(id); }}
                    />
                </div>
            )}

            {/* Actions */}
            {offer.status === NFT_OFFER_STATUS.ACTIVE && (
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
                                    onClick={handleAccept}
                                    disabled={accepting || (needsTokenPick && showPicker && acceptorTokenId === null)}
                                >
                                    {needsTokenPick && !showPicker ? 'Pick NFT to Trade' : 'Accept Deal'}
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
                            {isThisCancelling ? <><span className="btn__spinner" /> Cancelling…</> : 'Cancel Deal'}
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
