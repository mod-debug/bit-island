import { useState } from 'react';
import type { useAutoVault } from '../../hooks/useAutoVault.js';
import type { TokenInfo } from '../../config/tokens.js';
import { parseTokenAmount, formatTokenAmount } from '../../utils/tokenAmount.js';
import { findTokenByAddress } from '../../config/tokens.js';
import { useWalletConnect } from '@btc-vision/walletconnect';

interface Props {
    vault: ReturnType<typeof useAutoVault>;
    tokens: TokenInfo[];
}

type Mode = 'deposit' | 'withdraw';

export function DepositWithdrawPanel({ vault, tokens }: Props): React.JSX.Element {
    const { network } = useWalletConnect();
    const [mode, setMode] = useState<Mode>('deposit');
    const [amount, setAmount] = useState('');

    const selectedTokenInfo = network !== null
        ? findTokenByAddress(vault.selectedToken, network)
        : tokens[0];
    const symbol = selectedTokenInfo?.symbol ?? '???';
    const decimals = selectedTokenInfo?.decimals ?? 18;

    const userShares = vault.userInfo?.shares ?? 0n;
    const totalStaked = vault.vaultInfo?.totalStaked ?? 0n;
    const totalShares = vault.vaultInfo?.totalShares ?? 0n;
    const withdrawFeeBps = vault.vaultInfo?.withdrawFeeBps ?? 50n;

    // Calculate preview values
    let depositSharesPreview = '';
    let withdrawGrossPreview = '';
    let withdrawFeePreview = '';
    let withdrawNetPreview = '';

    if (mode === 'deposit' && amount !== '') {
        try {
            const rawAmount = parseTokenAmount(amount, decimals);
            if (totalShares === 0n || totalStaked === 0n) {
                depositSharesPreview = formatTokenAmount(rawAmount, decimals);
            } else {
                const shares = (rawAmount * totalShares) / totalStaked;
                depositSharesPreview = formatTokenAmount(shares, decimals);
            }
        } catch { /* invalid input */ }
    }

    if (mode === 'withdraw' && amount !== '') {
        try {
            const rawShares = parseTokenAmount(amount, decimals);
            if (totalShares > 0n) {
                const gross = (rawShares * totalStaked) / totalShares;
                const fee = (gross * withdrawFeeBps) / 10000n;
                const net = gross - fee;
                withdrawGrossPreview = formatTokenAmount(gross, decimals);
                withdrawFeePreview = formatTokenAmount(fee, decimals);
                withdrawNetPreview = formatTokenAmount(net, decimals);
            }
        } catch { /* invalid input */ }
    }

    const handleDeposit = async (): Promise<void> => {
        if (amount === '') return;
        try {
            const rawAmount = parseTokenAmount(amount, decimals);
            const success = await vault.deposit(vault.selectedToken, rawAmount);
            if (success) setAmount('');
        } catch (err) {
            // parseTokenAmount threw
        }
    };

    const handleWithdraw = async (): Promise<void> => {
        if (amount === '') return;
        try {
            const rawShares = parseTokenAmount(amount, decimals);
            const success = await vault.withdraw(vault.selectedToken, rawShares);
            if (success) setAmount('');
        } catch (err) {
            // parseTokenAmount threw
        }
    };

    const handleMax = (): void => {
        if (mode === 'deposit') {
            if (vault.tokenBalance > 0n) {
                setAmount(formatTokenAmount(vault.tokenBalance, decimals));
            }
        } else {
            if (userShares > 0n) {
                setAmount(formatTokenAmount(userShares, decimals));
            }
        }
    };

    return (
        <div id="av-deposit" className="av-card av-deposit-withdraw">
            {/* Token selector */}
            <div className="av__token-selector">
                {tokens.map((t) => (
                    <button
                        key={t.address}
                        className={`av__token-btn${vault.selectedToken === t.address ? ' av__token-btn--active' : ''}`}
                        style={{ '--token-color': t.color } as React.CSSProperties}
                        onClick={() => { vault.setSelectedToken(t.address); }}
                        type="button"
                    >
                        {t.icon !== undefined && (
                            <img src={t.icon} alt={t.symbol} className="av__token-icon" />
                        )}
                        {t.symbol}
                    </button>
                ))}
            </div>

            {/* Mode toggle */}
            <div className="av-toggle">
                <button
                    type="button"
                    className={`av-toggle__btn${mode === 'deposit' ? ' av-toggle__btn--active' : ''}`}
                    onClick={() => { setMode('deposit'); setAmount(''); }}
                >
                    Deposit
                </button>
                <button
                    type="button"
                    className={`av-toggle__btn${mode === 'withdraw' ? ' av-toggle__btn--active' : ''}`}
                    onClick={() => { setMode('withdraw'); setAmount(''); }}
                >
                    Withdraw
                </button>
            </div>

            {/* Input */}
            <div className="av-input-group">
                <label className="av-input-group__label">
                    {mode === 'deposit' ? `Amount (${symbol})` : `Shares to burn`}
                </label>
                <div className="av-input-group__row">
                    <input
                        type="text"
                        className="av-input"
                        placeholder="0.0"
                        value={amount}
                        onChange={(e) => { setAmount(e.target.value); }}
                        disabled={vault.depositing || vault.withdrawing}
                    />
                    <button
                        type="button"
                        className="av-btn av-btn--small"
                        onClick={handleMax}
                        disabled={vault.depositing || vault.withdrawing}
                    >
                        MAX
                    </button>
                </div>
                <span className="av-input-group__balance">
                    {mode === 'deposit'
                        ? `Balance: ${formatTokenAmount(vault.tokenBalance, decimals)} ${symbol}`
                        : `Your shares: ${formatTokenAmount(userShares, decimals)}`}
                </span>
            </div>

            {/* Preview */}
            {mode === 'deposit' && depositSharesPreview !== '' && (
                <div className="av-preview">
                    <div className="av-preview__row">
                        <span>You will receive</span>
                        <span className="av-preview__value">~{depositSharesPreview} shares</span>
                    </div>
                    <div className="av-preview__row">
                        <span>Share price</span>
                        <span className="av-preview__value">
                            1 share = {vault.sharePrice !== null ? (Number(vault.sharePrice) / 1e18).toFixed(4) : '1.0000'} {symbol}
                        </span>
                    </div>
                </div>
            )}

            {mode === 'withdraw' && withdrawGrossPreview !== '' && (
                <div className="av-preview">
                    <div className="av-preview__row">
                        <span>Gross amount</span>
                        <span className="av-preview__value">{withdrawGrossPreview} {symbol}</span>
                    </div>
                    <div className="av-preview__row av-preview__row--fee">
                        <span>Withdrawal fee ({Number(withdrawFeeBps) / 100}%)</span>
                        <span className="av-preview__value av-preview__value--red">-{withdrawFeePreview} {symbol}</span>
                    </div>
                    <div className="av-preview__row av-preview__row--net">
                        <span>You will receive</span>
                        <span className="av-preview__value av-preview__value--green">{withdrawNetPreview} {symbol}</span>
                    </div>
                </div>
            )}

            {/* Action button */}
            {mode === 'deposit' ? (
                <button
                    type="button"
                    className="av-btn av-btn--primary av-btn--full"
                    disabled={vault.depositing || amount === ''}
                    onClick={() => { void handleDeposit(); }}
                >
                    {vault.depositing ? 'Depositing...' : `Deposit ${symbol}`}
                </button>
            ) : (
                <button
                    type="button"
                    className="av-btn av-btn--secondary av-btn--full"
                    disabled={vault.withdrawing || amount === ''}
                    onClick={() => { void handleWithdraw(); }}
                >
                    {vault.withdrawing ? 'Withdrawing...' : `Withdraw ${symbol}`}
                </button>
            )}

            {/* Step tracker for deposit */}
            {vault.depositing && (
                <div className="av-steps">
                    {vault.depositSteps.map((step, i) => (
                        <div key={i} className={`av-step av-step--${step.status}`}>
                            <span className="av-step__dot" />
                            <span className="av-step__label">{step.label}</span>
                            {step.status === 'pending' && <span className="av-step__spinner" />}
                            {step.status === 'done' && <span className="av-step__check">OK</span>}
                            {step.status === 'error' && <span className="av-step__error">Failed</span>}
                        </div>
                    ))}
                    <p className="av-steps__warning">DO NOT CLOSE THIS PAGE</p>
                </div>
            )}

            {/* Errors */}
            {vault.depositError !== null && (
                <p className="av-error">{vault.depositError}</p>
            )}
            {vault.withdrawError !== null && (
                <p className="av-error">{vault.withdrawError}</p>
            )}
        </div>
    );
}
