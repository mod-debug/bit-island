import { useState, useCallback, useEffect } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useOTCEscrow } from '../hooks/useOTCEscrow.js';
import { escrowService } from '../services/OTCEscrowService.js';
import { parseTokenAmount } from '../utils/tokenAmount.js';
import { TokenSelector } from './TokenSelector.js';
import type { CreateOfferParams, TxStep } from '../types/index.js';

// ── Step sub-messages ────────────────────────────────────────────────────────

const STEP_HINTS: Record<string, string> = {
    'Approve token': 'Sign the approval in your wallet',
    'Block confirmation': 'Wait until the next block to finalize the deal... This may take a few minutes.',
    'Post offer': 'Sign the offer transaction in your wallet (2nd signature)',
    'Accept offer': 'Sign the swap transaction in your wallet (2nd signature)',
};

// ── Step indicator ────────────────────────────────────────────────────────────

interface StepIndicatorProps {
    steps: TxStep[];
}

function StepIndicator({ steps }: StepIndicatorProps): React.JSX.Element {
    return (
        <div className="step-indicator">
            {steps.map((step, i) => (
                <div
                    key={i}
                    className={[
                        'step-indicator__item',
                        step.status === 'pending' ? 'step-indicator__item--active' : '',
                        step.status === 'done' ? 'step-indicator__item--done' : '',
                        step.status === 'error' ? 'step-indicator__item--error' : '',
                    ]
                        .filter(Boolean)
                        .join(' ')}
                >
                    <div className="step-indicator__num">
                        {step.status === 'done' ? '✓' : step.status === 'error' ? '✗' : i + 1}
                    </div>
                    <div className="step-indicator__content">
                        <span className="step-indicator__label">{step.label}</span>
                        {step.status === 'pending' && (
                            <span className="step-indicator__sub">
                                {STEP_HINTS[step.label] ?? 'Processing...'}
                            </span>
                        )}
                        {step.status === 'done' && step.txId !== undefined && (
                            <span className="step-indicator__sub step-indicator__sub--tx">
                                tx: {step.txId.slice(0, 8)}…
                                <button className="btn btn--ghost btn--xs" onClick={() => { void navigator.clipboard.writeText(step.txId as string); }} title="Copy TX ID">&#x29C9;</button>
                                <a
                                    href={`https://mempool.opnet.org/fr/testnet4/tx/${step.txId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="step-indicator__tx-link"
                                >
                                    Mempool
                                </a>
                                <a
                                    href={`https://opscan.org/transactions/${step.txId}?network=op_testnet`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="step-indicator__tx-link"
                                >
                                    OPScan
                                </a>
                            </span>
                        )}
                        {step.status === 'error' && step.error !== undefined && (
                            <span className="step-indicator__sub step-indicator__sub--error">
                                {step.error.slice(0, 60)}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Transaction warning banner ───────────────────────────────────────────────

function TxWarningBanner(): React.JSX.Element {
    return (
        <div className="tx-warning-banner">
            <div className="tx-warning-banner__icon">&#x26A0;</div>
            <div className="tx-warning-banner__text">
                <strong>Do not close or leave this page.</strong>
                <br />
                This deal requires <strong>2 wallet signatures</strong>.
                After the first signature, the system waits for the next Bitcoin block
                to finalize the approval. You will then be asked to <strong>sign a second time</strong> to
                complete the deal.
            </div>
        </div>
    );
}

// ── Success state ─────────────────────────────────────────────────────────────

interface SuccessProps {
    offerId: bigint;
    onReset: () => void;
}

function CreateSuccess({ offerId, onReset }: SuccessProps): React.JSX.Element {
    return (
        <div className="create-success">
            <span className="create-success__icon">🏴‍☠️</span>
            <h3 className="create-success__title">Offer Posted!</h3>
            <p className="create-success__sub">
                Your deal is live on Bit OTC Escrow.
                <br />
                Share it with potential trading partners.
            </p>
            <div className="create-success__id">
                Offer #{offerId.toString()}
            </div>
            <button className="btn btn--primary" onClick={onReset}>
                Post Another Deal
            </button>
        </div>
    );
}

// ── Main form ─────────────────────────────────────────────────────────────────

interface CreateOfferProps {
    /** When true, renders without the outer section wrapper (used inside CreateDeal tabs) */
    embedded?: boolean;
}

export function CreateOffer({ embedded = false }: CreateOfferProps): React.JSX.Element {
    const { walletAddress, openConnectModal } = useWalletConnect();
    const { creating, createSteps, createError, lastCreatedId, createOffer, resetCreate, awaitingContinue, confirmContinue } = useOTCEscrow();

    const [offeredToken, setOfferedToken] = useState('');
    const [offeredAmount, setOfferedAmount] = useState('');
    const [wantedToken, setWantedToken] = useState('');
    const [wantedAmount, setWantedAmount] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);

    /** Resolved decimals for each token (fetched state; defaults applied at render) */
    const [fetchedOfferedDecimals, setFetchedOfferedDecimals] = useState<number>(18);
    const [fetchedWantedDecimals, setFetchedWantedDecimals] = useState<number>(18);
    const [fetchedOfferedSymbol, setFetchedOfferedSymbol] = useState<string>('');
    const [fetchedWantedSymbol, setFetchedWantedSymbol] = useState<string>('');

    // Derive effective values: use fetched when address is valid, defaults otherwise
    const offeredValid = offeredToken.trim().length >= 10;
    const wantedValid = wantedToken.trim().length >= 10;
    const offeredDecimals = offeredValid ? fetchedOfferedDecimals : 18;
    const wantedDecimals = wantedValid ? fetchedWantedDecimals : 18;
    const offeredSymbol = offeredValid ? fetchedOfferedSymbol : '';
    const wantedSymbol = wantedValid ? fetchedWantedSymbol : '';

    // Fetch decimals + symbol when token addresses change
    useEffect(() => {
        const addr = offeredToken.trim();
        if (addr.length < 10) return;
        let cancelled = false;
        void (async () => {
            const [dec, sym] = await Promise.all([
                escrowService.resolveTokenDecimals(addr),
                escrowService.resolveTokenSymbol(addr),
            ]);
            if (!cancelled) {
                setFetchedOfferedDecimals(dec);
                setFetchedOfferedSymbol(sym);
            }
        })();
        return () => { cancelled = true; };
    }, [offeredToken]);

    useEffect(() => {
        const addr = wantedToken.trim();
        if (addr.length < 10) return;
        let cancelled = false;
        void (async () => {
            const [dec, sym] = await Promise.all([
                escrowService.resolveTokenDecimals(addr),
                escrowService.resolveTokenSymbol(addr),
            ]);
            if (!cancelled) {
                setFetchedWantedDecimals(dec);
                setFetchedWantedSymbol(sym);
            }
        })();
        return () => { cancelled = true; };
    }, [wantedToken]);

    const validate = useCallback((): CreateOfferParams | null => {
        setValidationError(null);

        if (offeredToken.trim().length < 10) {
            setValidationError('Enter a valid offered token address');
            return null;
        }
        if (wantedToken.trim().length < 10) {
            setValidationError('Enter a valid wanted token address');
            return null;
        }
        if (offeredToken.trim().toLowerCase() === wantedToken.trim().toLowerCase()) {
            setValidationError('Offered and wanted tokens must be different');
            return null;
        }

        let parsedOffered: bigint;
        let parsedWanted: bigint;
        try {
            parsedOffered = parseTokenAmount(offeredAmount, offeredDecimals);
        } catch (err) {
            setValidationError(`Offered amount: ${err instanceof Error ? err.message : 'invalid'}`);
            return null;
        }
        try {
            parsedWanted = parseTokenAmount(wantedAmount, wantedDecimals);
        } catch (err) {
            setValidationError(`Wanted amount: ${err instanceof Error ? err.message : 'invalid'}`);
            return null;
        }

        return {
            offeredToken: offeredToken.trim(),
            offeredAmount: parsedOffered,
            wantedToken: wantedToken.trim(),
            wantedAmount: parsedWanted,
        };
    }, [offeredToken, offeredAmount, wantedToken, wantedAmount, offeredDecimals, wantedDecimals]);

    const handleSubmit = useCallback(
        async (e: React.FormEvent): Promise<void> => {
            e.preventDefault();
            const params = validate();
            if (params === null) return;
            await createOffer(params);
        },
        [validate, createOffer],
    );

    const isInProgress = creating;
    const isDone = lastCreatedId !== null;
    const allIdle = createSteps.every((s) => s.status === 'idle');

    if (isDone && lastCreatedId !== null) {
        const successContent = (
            <div className="create-offer-card">
                <CreateSuccess offerId={lastCreatedId} onReset={resetCreate} />
            </div>
        );

        if (embedded) return successContent;

        return (
            <section className="otc-section" id="create">
                <div className="section-header">
                    <div className="section-tag">Bit OTC Escrow</div>
                    <h2 className="section-title">Post a <span className="text-accent">Deal</span></h2>
                </div>
                {successContent}
            </section>
        );
    }

    const formContent = (
            <div className="create-offer-card">
                {/* Preview */}
                <div className="offer-preview">
                    <div className="offer-preview__inner">
                        <div className="offer-preview__glow" aria-hidden="true" />
                        <div className="offer-preview__token">
                            <span className="offer-preview__amount">
                                {offeredAmount !== '' ? offeredAmount : '???'}
                            </span>
                            <span className="offer-preview__addr">
                                {offeredSymbol !== '' ? offeredSymbol : offeredToken !== '' ? `${offeredToken.slice(0, 6)}…${offeredToken.slice(-4)}` : 'Token A'}
                            </span>
                        </div>
                        <div className="offer-preview__arrow">⚓</div>
                        <div className="offer-preview__token">
                            <span className="offer-preview__amount">
                                {wantedAmount !== '' ? wantedAmount : '???'}
                            </span>
                            <span className="offer-preview__addr">
                                {wantedSymbol !== '' ? wantedSymbol : wantedToken !== '' ? `${wantedToken.slice(0, 6)}…${wantedToken.slice(-4)}` : 'Token B'}
                            </span>
                        </div>
                    </div>
                    <p className="offer-preview__hint">Trustless · On-chain · Bitcoin L1</p>
                </div>

                {/* Form */}
                <form className="create-form" onSubmit={(e) => { void handleSubmit(e); }}>
                    <TokenSelector
                        label="You Offer — Token"
                        value={offeredToken}
                        onChange={setOfferedToken}
                        disabled={isInProgress}
                    />

                    <div className="form-group">
                        <label className="form-label">
                            You Offer — Amount{offeredSymbol !== '' ? ` (${offeredSymbol})` : ''} <span className="form-required">*</span>
                        </label>
                        <input
                            className="form-input"
                            type="text"
                            placeholder="e.g. 500"
                            value={offeredAmount}
                            onChange={(e) => { setOfferedAmount(e.target.value); }}
                            disabled={isInProgress}
                            autoComplete="off"
                        />
                        <span className="form-hint">
                            Enter the amount in tokens (e.g. 500 = 500 tokens). Decimals supported (e.g. 0.5).
                        </span>
                    </div>

                    <TokenSelector
                        label="You Want — Token"
                        value={wantedToken}
                        onChange={setWantedToken}
                        disabled={isInProgress}
                    />

                    <div className="form-group">
                        <label className="form-label">
                            You Want — Amount{wantedSymbol !== '' ? ` (${wantedSymbol})` : ''} <span className="form-required">*</span>
                        </label>
                        <input
                            className="form-input"
                            type="text"
                            placeholder="e.g. 1000"
                            value={wantedAmount}
                            onChange={(e) => { setWantedAmount(e.target.value); }}
                            disabled={isInProgress}
                            autoComplete="off"
                        />
                        <span className="form-hint">
                            Enter the amount in tokens (e.g. 1000 = 1000 tokens). Decimals supported (e.g. 0.5).
                        </span>
                    </div>

                    {/* Validation error */}
                    {validationError !== null && (
                        <div className="alert alert--error">{validationError}</div>
                    )}

                    {/* Transaction error */}
                    {createError !== null && (
                        <div className="alert alert--error">{createError}</div>
                    )}

                    {/* Warning banner during transaction */}
                    {isInProgress && <TxWarningBanner />}

                    {/* Step progress */}
                    {!allIdle && <StepIndicator steps={createSteps} />}

                    {/* Continue button — appears after block confirmation */}
                    {awaitingContinue && (
                        <div className="continue-gate" id="continue-sign">
                            <div className="continue-gate__message">
                                Block confirmed! You can now finalize the deal.
                                Take your time — the approval does not expire.
                            </div>
                            <button
                                type="button"
                                className="btn btn--primary btn--full btn--lg"
                                onClick={confirmContinue}
                            >
                                Continue — Sign Final Transaction
                            </button>
                        </div>
                    )}

                    {/* CTA */}
                    {walletAddress === null || walletAddress === undefined ? (
                        <button type="button" className="btn btn--primary btn--full btn--lg" onClick={openConnectModal}>
                            Connect Wallet to Post a Deal
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="btn btn--primary btn--full btn--lg"
                            disabled={isInProgress}
                        >
                            {isInProgress ? (
                                <>
                                    <span className="btn__spinner" />
                                    Processing…
                                </>
                            ) : (
                                '🏴‍☠️ Post Deal on Bitcoin'
                            )}
                        </button>
                    )}

                    <p className="form-disclaimer">
                        2 transactions required: approve + post deal.
                        Your tokens are locked until someone accepts or you cancel.
                    </p>
                </form>
            </div>
    );

    if (embedded) return formContent;

    return (
        <section className="otc-section" id="create">
            <div className="section-header">
                <div className="section-tag">Bit OTC Escrow</div>
                <h2 className="section-title">
                    Post a <span className="text-accent">Deal</span>
                </h2>
                <p className="section-sub">
                    Lock your tokens in the Pirate&apos;s Code. The escrow holds them until a counterparty accepts.
                </p>
            </div>
            {formContent}
        </section>
    );
}
