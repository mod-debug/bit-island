import { useState, useCallback } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useNFTEscrow } from '../hooks/useNFTEscrow.js';
import { NFT_OFFER_TYPE, type CreateNftOfferParams, type TxStep } from '../types/index.js';
import { parseTokenAmount } from '../utils/tokenAmount.js';
import { NftCollectionSelector } from './NftCollectionSelector.js';
import { NftTokenPicker } from './NftTokenPicker.js';
import { TokenSelector } from './TokenSelector.js';

// ── Step sub-messages ────────────────────────────────────────────────────────

const STEP_HINTS: Record<string, string> = {
    'Approve asset': 'Sign the approval in your wallet',
    'Block confirmation': 'Wait until the next block... This may take a few minutes.',
    'Post offer': 'Sign the offer transaction in your wallet (2nd signature)',
};

function StepIndicator({ steps }: { steps: TxStep[] }): React.JSX.Element {
    return (
        <div className="step-indicator">
            {steps.map((step, i) => (
                <div
                    key={i}
                    className={['step-indicator__item', step.status === 'pending' ? 'step-indicator__item--active' : '', step.status === 'done' ? 'step-indicator__item--done' : '', step.status === 'error' ? 'step-indicator__item--error' : ''].filter(Boolean).join(' ')}
                >
                    <div className="step-indicator__num">
                        {step.status === 'done' ? '\u2713' : step.status === 'error' ? '\u2717' : i + 1}
                    </div>
                    <div className="step-indicator__content">
                        <span className="step-indicator__label">{step.label}</span>
                        {step.status === 'pending' && (
                            <span className="step-indicator__sub">{STEP_HINTS[step.label] ?? 'Processing...'}</span>
                        )}
                        {step.status === 'done' && step.txId !== undefined && (
                            <span className="step-indicator__sub step-indicator__sub--tx">
                                tx: {step.txId.slice(0, 8)}…
                                <button className="btn btn--ghost btn--xs" onClick={() => { void navigator.clipboard.writeText(step.txId as string); }} title="Copy TX ID">&#x29C9;</button>
                                <a href={`https://opscan.org/transactions/${step.txId}?network=op_testnet`} target="_blank" rel="noopener noreferrer" className="step-indicator__tx-link">OPScan</a>
                            </span>
                        )}
                        {step.status === 'error' && step.error !== undefined && (
                            <span className="step-indicator__sub step-indicator__sub--error">{step.error.slice(0, 60)}</span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function TxWarningBanner(): React.JSX.Element {
    return (
        <div className="tx-warning-banner">
            <div className="tx-warning-banner__icon">&#x26A0;</div>
            <div className="tx-warning-banner__text">
                <strong>Do not close or leave this page.</strong>
                <br />
                This deal requires <strong>2 wallet signatures</strong>.
            </div>
        </div>
    );
}

interface CreateNftOfferProps {
    /** When true, renders without the outer section wrapper (used inside CreateDeal tabs) */
    embedded?: boolean;
}

export function CreateNftOffer({ embedded = false }: CreateNftOfferProps): React.JSX.Element {
    const { walletAddress, openConnectModal } = useWalletConnect();
    const { creating, createSteps, createError, lastCreatedId, createNftOffer, resetCreate, awaitingContinue, confirmContinue } = useNFTEscrow();

    const [offerType, setOfferType] = useState<number>(NFT_OFFER_TYPE.NFT_FOR_NFT);

    // Offered side
    const [offeredCollection, setOfferedCollection] = useState('');
    const [offeredTokenId, setOfferedTokenId] = useState<bigint | null>(null);
    const [offeredAmount, setOfferedAmount] = useState('');

    // Wanted side
    const [wantedCollection, setWantedCollection] = useState('');
    const [wantedTokenId, setWantedTokenId] = useState<bigint | null>(null);
    const [wantedAmount, setWantedAmount] = useState('');
    const [wantAnyNft, setWantAnyNft] = useState(false);

    const [validationError, setValidationError] = useState<string | null>(null);

    const offersNft = offerType === NFT_OFFER_TYPE.NFT_FOR_NFT || offerType === NFT_OFFER_TYPE.NFT_FOR_TOKEN;
    const wantsNft = offerType === NFT_OFFER_TYPE.NFT_FOR_NFT || offerType === NFT_OFFER_TYPE.TOKEN_FOR_NFT;

    const validate = useCallback((): CreateNftOfferParams | null => {
        setValidationError(null);

        if (offeredCollection.trim().length < 10) {
            setValidationError('Select an offered collection/token');
            return null;
        }
        if (wantedCollection.trim().length < 10) {
            setValidationError('Select a wanted collection/token');
            return null;
        }

        let parsedOfferedTokenId = 0n;
        let parsedOfferedAmount = 0n;
        let parsedWantedTokenId = 0n;
        let parsedWantedAmount = 0n;

        if (offersNft) {
            if (offeredTokenId === null) {
                setValidationError('Select an NFT to offer');
                return null;
            }
            parsedOfferedTokenId = offeredTokenId;
        } else {
            try {
                parsedOfferedAmount = parseTokenAmount(offeredAmount, 18);
            } catch (err) {
                setValidationError(`Offered amount: ${err instanceof Error ? err.message : 'invalid'}`);
                return null;
            }
        }

        if (wantsNft) {
            if (!wantAnyNft && wantedTokenId === null) {
                setValidationError('Select a wanted NFT or check "Any from collection"');
                return null;
            }
            parsedWantedTokenId = wantAnyNft ? 0n : (wantedTokenId ?? 0n);
        } else {
            try {
                parsedWantedAmount = parseTokenAmount(wantedAmount, 18);
            } catch (err) {
                setValidationError(`Wanted amount: ${err instanceof Error ? err.message : 'invalid'}`);
                return null;
            }
        }

        return {
            offerType: offerType as 0 | 1 | 2,
            offeredCollection: offeredCollection.trim(),
            offeredTokenId: parsedOfferedTokenId,
            offeredAmount: parsedOfferedAmount,
            wantedCollection: wantedCollection.trim(),
            wantedTokenId: parsedWantedTokenId,
            wantedAmount: parsedWantedAmount,
        };
    }, [offerType, offeredCollection, offeredTokenId, offeredAmount, wantedCollection, wantedTokenId, wantedAmount, wantAnyNft, offersNft, wantsNft]);

    const handleSubmit = useCallback(
        async (e: React.FormEvent): Promise<void> => {
            e.preventDefault();
            const params = validate();
            if (params === null) return;
            await createNftOffer(params);
        },
        [validate, createNftOffer],
    );

    const isInProgress = creating;
    const isDone = lastCreatedId !== null;
    const allIdle = createSteps.every((s) => s.status === 'idle');

    if (isDone && lastCreatedId !== null) {
        const successContent = (
            <div className="create-offer-card">
                <div className="create-success">
                    <span className="create-success__icon">🏴‍☠️</span>
                    <h3 className="create-success__title">NFT Offer Posted!</h3>
                    <p className="create-success__sub">Your NFT deal is live on Bit OTC Escrow.</p>
                    <div className="create-success__id">NFT Offer #{lastCreatedId.toString()}</div>
                    <button className="btn btn--primary" onClick={resetCreate}>Post Another Deal</button>
                </div>
            </div>
        );

        if (embedded) return successContent;

        return (
            <section className="otc-section" id="create-nft">
                <div className="section-header">
                    <div className="section-tag">Bit OTC Escrow</div>
                    <h2 className="section-title">Post an <span className="text-accent">NFT Deal</span></h2>
                </div>
                {successContent}
            </section>
        );
    }

    const formContent = (
            <div className="create-offer-card">
                <form className="create-form" onSubmit={(e) => { void handleSubmit(e); }}>
                    {/* Offer type toggle */}
                    <div className="form-group">
                        <label className="form-label">Deal Type</label>
                        <div className="offer-type-toggle">
                            <button
                                type="button"
                                className={`offer-type-toggle__btn ${offerType === NFT_OFFER_TYPE.NFT_FOR_NFT ? 'offer-type-toggle__btn--active' : ''}`}
                                onClick={() => { setOfferType(NFT_OFFER_TYPE.NFT_FOR_NFT); }}
                                disabled={isInProgress}
                            >
                                NFT ↔ NFT
                            </button>
                            <button
                                type="button"
                                className={`offer-type-toggle__btn ${offerType === NFT_OFFER_TYPE.NFT_FOR_TOKEN ? 'offer-type-toggle__btn--active' : ''}`}
                                onClick={() => { setOfferType(NFT_OFFER_TYPE.NFT_FOR_TOKEN); }}
                                disabled={isInProgress}
                            >
                                NFT → Token
                            </button>
                            <button
                                type="button"
                                className={`offer-type-toggle__btn ${offerType === NFT_OFFER_TYPE.TOKEN_FOR_NFT ? 'offer-type-toggle__btn--active' : ''}`}
                                onClick={() => { setOfferType(NFT_OFFER_TYPE.TOKEN_FOR_NFT); }}
                                disabled={isInProgress}
                            >
                                Token → NFT
                            </button>
                        </div>
                    </div>

                    {/* ── YOU OFFER ── */}
                    <div className="form-group">
                        <div className="form-label form-label--section">You Offer</div>
                    </div>

                    {offersNft ? (
                        <>
                            <NftCollectionSelector
                                label="Collection"
                                value={offeredCollection}
                                onChange={setOfferedCollection}
                                disabled={isInProgress}
                            />
                            <div className="form-group">
                                <label className="form-label">Your NFT</label>
                                <NftTokenPicker
                                    collectionAddress={offeredCollection}
                                    selectedTokenId={offeredTokenId}
                                    onSelect={setOfferedTokenId}
                                    disabled={isInProgress}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <TokenSelector
                                label="Token"
                                value={offeredCollection}
                                onChange={setOfferedCollection}
                                disabled={isInProgress}
                            />
                            <div className="form-group">
                                <label className="form-label">Amount <span className="form-required">*</span></label>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="e.g. 500"
                                    value={offeredAmount}
                                    onChange={(e) => { setOfferedAmount(e.target.value); }}
                                    disabled={isInProgress}
                                    autoComplete="off"
                                />
                            </div>
                        </>
                    )}

                    {/* ── YOU WANT ── */}
                    <div className="form-group">
                        <div className="form-label form-label--section">You Want</div>
                    </div>

                    {wantsNft ? (
                        <>
                            <NftCollectionSelector
                                label="Collection"
                                value={wantedCollection}
                                onChange={setWantedCollection}
                                disabled={isInProgress}
                            />
                            <div className="form-group">
                                <label className="form-label">
                                    <label className="nft-any-check">
                                        <input
                                            type="checkbox"
                                            checked={wantAnyNft}
                                            onChange={(e) => { setWantAnyNft(e.target.checked); }}
                                            disabled={isInProgress}
                                        />
                                        Accept any NFT from this collection
                                    </label>
                                </label>
                                {!wantAnyNft && (
                                    <div style={{ marginTop: '8px' }}>
                                        <label className="form-label">Specific Token ID</label>
                                        <input
                                            className="form-input"
                                            type="text"
                                            placeholder="e.g. 42"
                                            value={wantedTokenId?.toString() ?? ''}
                                            onChange={(e) => {
                                                const v = e.target.value.trim();
                                                if (v.length === 0) { setWantedTokenId(null); return; }
                                                try { setWantedTokenId(BigInt(v)); } catch { /* ignore */ }
                                            }}
                                            disabled={isInProgress}
                                            autoComplete="off"
                                        />
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <TokenSelector
                                label="Token"
                                value={wantedCollection}
                                onChange={setWantedCollection}
                                disabled={isInProgress}
                            />
                            <div className="form-group">
                                <label className="form-label">Amount <span className="form-required">*</span></label>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="e.g. 1000"
                                    value={wantedAmount}
                                    onChange={(e) => { setWantedAmount(e.target.value); }}
                                    disabled={isInProgress}
                                    autoComplete="off"
                                />
                            </div>
                        </>
                    )}

                    {/* Validation error */}
                    {validationError !== null && <div className="alert alert--error">{validationError}</div>}
                    {createError !== null && <div className="alert alert--error">{createError}</div>}

                    {isInProgress && <TxWarningBanner />}
                    {!allIdle && <StepIndicator steps={createSteps} />}

                    {awaitingContinue && (
                        <div className="continue-gate" id="continue-sign">
                            <div className="continue-gate__message">Block confirmed! Finalize your NFT deal.</div>
                            <button type="button" className="btn btn--primary btn--full btn--lg" onClick={confirmContinue}>
                                Continue — Sign Final Transaction
                            </button>
                        </div>
                    )}

                    {walletAddress === null || walletAddress === undefined ? (
                        <button type="button" className="btn btn--primary btn--full btn--lg" onClick={openConnectModal}>
                            Connect Wallet to Post NFT Deal
                        </button>
                    ) : (
                        <button type="submit" className="btn btn--primary btn--full btn--lg" disabled={isInProgress}>
                            {isInProgress ? <><span className="btn__spinner" /> Processing…</> : '🏴‍☠️ Post NFT Deal on Bitcoin'}
                        </button>
                    )}

                    <p className="form-disclaimer">2 transactions required: approve + post deal.</p>
                </form>
            </div>
    );

    if (embedded) return formContent;

    return (
        <section className="otc-section" id="create-nft">
            <div className="section-header">
                <div className="section-tag">Bit OTC Escrow</div>
                <h2 className="section-title">
                    Post an <span className="text-accent">NFT Deal</span>
                </h2>
                <p className="section-sub">
                    Trade NFTs for NFTs or tokens. The escrow holds your asset until a counterparty accepts.
                </p>
            </div>
            {formContent}
        </section>
    );
}
