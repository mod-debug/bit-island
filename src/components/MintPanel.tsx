import { useState } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useMint } from '../hooks/useMint.js';

export function MintPanel(): React.JSX.Element {
    const { walletAddress, openConnectModal } = useWalletConnect();
    const { stats, loading, minting, error, mint } = useMint();
    const [lastTxId, setLastTxId] = useState<string | null>(null);
    const [mintSuccess, setMintSuccess] = useState(false);

    const minted = stats !== null ? Number(stats.totalMinted) : 0;
    const max = stats !== null ? Number(stats.maxSupply) : 4200;
    const progress = max > 0 ? (minted / max) * 100 : 0;
    const priceInBtc = stats !== null
        ? (Number(stats.mintPrice) / 100_000_000).toFixed(5)
        : '0.00050';
    const ownerBalance = stats !== null ? Number(stats.ownerBalance) : 0;

    const handleMint = async (): Promise<void> => {
        setMintSuccess(false);
        setLastTxId(null);
        await mint();
        setMintSuccess(true);
    };

    return (
        <section className="mint-panel" id="mint" aria-labelledby="mint-title">
            <div className="section-header">
                <div className="section-tag">Live Mint</div>
                <h2 className="section-title" id="mint-title">
                    Claim Your <span className="text-accent">Monkey</span>
                </h2>
                <p className="section-sub">
                    Mint a BTC Monkey directly on Bitcoin L1. Each one is unique,
                    stored permanently on-chain via OPNet.
                </p>
            </div>

            <div className="mint-card">
                {/* Monkey preview card */}
                <div className="mint-card__preview">
                    <div className="monkey-preview">
                        <div className="monkey-preview__glow" aria-hidden="true" />
                        <div className="monkey-preview__img-wrap">
                            <img
                                src="/monkey-hero.png"
                                alt="BTC Monkey preview"
                                className="monkey-preview__img"
                                onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                            />
                            <div className="monkey-preview__placeholder" aria-hidden="true">
                                <span className="monkey-preview__question">?</span>
                                <span className="monkey-preview__hint">Your monkey awaits</span>
                            </div>
                        </div>
                        <div className="monkey-preview__badge">
                            <span className="monkey-preview__badge-dot" />
                            Live on Bitcoin L1
                        </div>
                    </div>
                </div>

                {/* Mint info + action */}
                <div className="mint-card__info">
                    <div className="mint-progress">
                        <div className="mint-progress__header">
                            <span className="mint-progress__label">Minted</span>
                            <span className="mint-progress__count">
                                {loading ? '...' : `${minted.toLocaleString()} / ${max.toLocaleString()}`}
                            </span>
                        </div>
                        <div className="mint-progress__track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                            <div
                                className="mint-progress__fill"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <span className="mint-progress__pct">{progress.toFixed(1)}% claimed</span>
                    </div>

                    <div className="mint-details">
                        <div className="mint-detail">
                            <span className="mint-detail__label">Price</span>
                            <span className="mint-detail__value text-gold">{priceInBtc} BTC</span>
                        </div>
                        <div className="mint-detail">
                            <span className="mint-detail__label">Network</span>
                            <span className="mint-detail__value">OPNet Testnet</span>
                        </div>
                        <div className="mint-detail">
                            <span className="mint-detail__label">Max per wallet</span>
                            <span className="mint-detail__value">10</span>
                        </div>
                        {walletAddress !== null && walletAddress !== undefined && (
                            <div className="mint-detail">
                                <span className="mint-detail__label">You own</span>
                                <span className="mint-detail__value text-accent">
                                    {ownerBalance} Monkey{ownerBalance !== 1 ? 's' : ''}
                                </span>
                            </div>
                        )}
                    </div>

                    {error !== null && (
                        <div className="alert alert--error" role="alert">
                            {error}
                        </div>
                    )}

                    {mintSuccess && lastTxId === null && (
                        <div className="alert alert--success" role="status">
                            Monkey minted successfully! Check your wallet.
                        </div>
                    )}

                    {walletAddress !== null && walletAddress !== undefined ? (
                        <button
                            className="btn btn--primary btn--xl btn--full"
                            onClick={() => { void handleMint(); }}
                            disabled={minting || loading}
                            aria-busy={minting}
                        >
                            {minting ? (
                                <>
                                    <span className="btn__spinner" />
                                    Minting on Bitcoin...
                                </>
                            ) : (
                                'Mint a Monkey'
                            )}
                        </button>
                    ) : (
                        <button
                            className="btn btn--primary btn--xl btn--full"
                            onClick={openConnectModal}
                        >
                            Connect Wallet to Mint
                        </button>
                    )}

                    <p className="mint-card__disclaimer">
                        Transactions are processed on Bitcoin L1 via OPNet.
                        Confirm in your OP_WALLET.
                    </p>
                </div>
            </div>
        </section>
    );
}
