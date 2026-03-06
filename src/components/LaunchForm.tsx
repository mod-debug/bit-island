import { useState } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useLaunch } from '../hooks/useLaunch.js';
import type { TokenConfig } from '../types/index.js';

function formatAddress(addr: string): string {
    return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

const DEFAULT_FORM: TokenConfig = {
    name: '',
    symbol: '',
    decimals: 8,
    maxSupply: 1_000_000n,
    description: '',
};

export function LaunchForm(): React.JSX.Element {
    const { walletAddress, openConnectModal } = useWalletConnect();
    const { launching, result, error, launch, reset } = useLaunch();

    const [form, setForm] = useState<TokenConfig>(DEFAULT_FORM);
    const [supplyInput, setSupplyInput] = useState('1000000');

    function handleChange(field: keyof TokenConfig, value: string): void {
        if (field === 'maxSupply') {
            setSupplyInput(value);
            const num = value.replace(/[^0-9]/g, '');
            setForm((f) => ({ ...f, maxSupply: num.length > 0 ? BigInt(num) : 0n }));
        } else if (field === 'decimals') {
            setForm((f) => ({ ...f, decimals: Math.min(18, Math.max(0, parseInt(value) || 0)) }));
        } else {
            setForm((f) => ({ ...f, [field]: value }));
        }
    }

    function handleSymbolChange(value: string): void {
        setForm((f) => ({ ...f, symbol: value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) }));
    }

    const canLaunch =
        form.name.trim().length >= 2 &&
        form.symbol.trim().length >= 1 &&
        form.maxSupply > 0n;

    async function handleLaunch(): Promise<void> {
        if (!canLaunch) return;
        await launch(form);
    }

    if (result !== null) {
        return (
            <section className="launch-section" id="launch" aria-labelledby="launch-title">
                <div className="section-header">
                    <div className="section-tag">Launch Complete</div>
                    <h2 className="section-title" id="launch-title">
                        Token <span className="text-accent">Deployed!</span>
                    </h2>
                </div>
                <div className="launch-success">
                    <div className="launch-success__icon" aria-hidden="true">&#127881;</div>
                    <h3 className="launch-success__name">${form.symbol} is live on Bitcoin L1</h3>
                    <p className="launch-success__sub">
                        Your token <strong>{form.name}</strong> is permanently deployed on Bitcoin.
                    </p>
                    <div className="launch-success__details">
                        <div className="success-detail">
                            <span className="success-detail__label">Contract Address</span>
                            <span className="success-detail__value monospace">
                                {formatAddress(result.contractAddress)}
                                <button
                                    className="copy-btn"
                                    onClick={() => { void navigator.clipboard.writeText(result.contractAddress); }}
                                    aria-label="Copy address"
                                >
                                    &#x2398;
                                </button>
                            </span>
                        </div>
                        <div className="success-detail">
                            <span className="success-detail__label">Deploy TX</span>
                            <span className="success-detail__value monospace">
                                {formatAddress(result.deployTxId)}
                            </span>
                        </div>
                        <div className="success-detail">
                            <span className="success-detail__label">Symbol</span>
                            <span className="success-detail__value text-accent">${form.symbol}</span>
                        </div>
                        <div className="success-detail">
                            <span className="success-detail__label">Total Supply</span>
                            <span className="success-detail__value text-gold">
                                {form.maxSupply.toLocaleString()}
                            </span>
                        </div>
                    </div>
                    <div className="launch-success__actions">
                        <button className="btn btn--primary btn--lg" onClick={reset}>
                            Launch Another Token
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="launch-section" id="launch" aria-labelledby="launch-title">
            <div className="section-header">
                <div className="section-tag">Token Launchpad</div>
                <h2 className="section-title" id="launch-title">
                    Launch Your Token<br />
                    <span className="text-accent">on Bitcoin L1</span>
                </h2>
                <p className="section-sub">
                    Fill in the details below. Your OP20 token will be deployed
                    directly on Bitcoin in seconds — no coding needed.
                </p>
            </div>

            <div className="launch-card">
                {/* Preview */}
                <div className="launch-preview">
                    <div className="token-preview">
                        <div className="token-preview__glow" aria-hidden="true" />
                        <div className="token-preview__symbol">
                            {form.symbol.length > 0 ? `$${form.symbol}` : '$???'}
                        </div>
                        <div className="token-preview__name">
                            {form.name.length > 0 ? form.name : 'Your Token Name'}
                        </div>
                        <div className="token-preview__supply">
                            {form.maxSupply.toLocaleString()} tokens
                        </div>
                        <div className="token-preview__network">
                            <span className="dot-green" />
                            Bitcoin L1 via OPNet
                        </div>
                    </div>
                    <div className="launch-preview__hint">
                        Live preview updates as you type
                    </div>
                </div>

                {/* Form */}
                <div className="launch-form">
                    <div className="form-group">
                        <label className="form-label" htmlFor="token-name">
                            Token Name <span className="form-required">*</span>
                        </label>
                        <input
                            id="token-name"
                            className="form-input"
                            type="text"
                            placeholder="e.g. BTC Monkey"
                            value={form.name}
                            onChange={(e) => { handleChange('name', e.target.value); }}
                            maxLength={32}
                            aria-required="true"
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label" htmlFor="token-symbol">
                                Symbol <span className="form-required">*</span>
                            </label>
                            <input
                                id="token-symbol"
                                className="form-input form-input--mono"
                                type="text"
                                placeholder="MONK"
                                value={form.symbol}
                                onChange={(e) => { handleSymbolChange(e.target.value); }}
                                maxLength={8}
                                aria-required="true"
                            />
                            <span className="form-hint">Max 8 chars, auto-uppercase</span>
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="token-decimals">
                                Decimals
                            </label>
                            <input
                                id="token-decimals"
                                className="form-input form-input--mono"
                                type="number"
                                min={0}
                                max={18}
                                value={form.decimals}
                                onChange={(e) => { handleChange('decimals', e.target.value); }}
                            />
                            <span className="form-hint">Standard is 8 (like BTC)</span>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="token-supply">
                            Total Supply <span className="form-required">*</span>
                        </label>
                        <input
                            id="token-supply"
                            className="form-input form-input--mono"
                            type="text"
                            placeholder="21000000"
                            value={supplyInput}
                            onChange={(e) => { handleChange('maxSupply', e.target.value); }}
                            aria-required="true"
                        />
                        <span className="form-hint">
                            {form.maxSupply.toLocaleString()} tokens will be created
                        </span>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="token-desc">
                            Description
                        </label>
                        <textarea
                            id="token-desc"
                            className="form-textarea"
                            placeholder="What is your token for?"
                            value={form.description}
                            onChange={(e) => { handleChange('description', e.target.value); }}
                            rows={3}
                            maxLength={200}
                        />
                    </div>

                    {error !== null && (
                        <div className="alert alert--error" role="alert">{error}</div>
                    )}

                    {walletAddress !== null && walletAddress !== undefined ? (
                        <button
                            className="btn btn--primary btn--xl btn--full"
                            onClick={() => { void handleLaunch(); }}
                            disabled={launching || !canLaunch}
                            aria-busy={launching}
                        >
                            {launching ? (
                                <>
                                    <span className="btn__spinner" />
                                    Deploying on Bitcoin...
                                </>
                            ) : (
                                'Launch Token on Bitcoin'
                            )}
                        </button>
                    ) : (
                        <button
                            className="btn btn--primary btn--xl btn--full"
                            onClick={openConnectModal}
                        >
                            Connect Wallet to Launch
                        </button>
                    )}

                    <p className="form-disclaimer">
                        Your token will be permanently deployed on Bitcoin L1 via OPNet.
                        A small BTC fee is required to cover the on-chain transaction.
                    </p>
                </div>
            </div>
        </section>
    );
}
