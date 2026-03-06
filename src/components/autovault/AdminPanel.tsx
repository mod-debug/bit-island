import { useState } from 'react';
import type { useAutoVault } from '../../hooks/useAutoVault.js';
import type { TokenInfo } from '../../config/tokens.js';
import { parseTokenAmount, formatTokenAmount } from '../../utils/tokenAmount.js';

interface Props {
    vault: ReturnType<typeof useAutoVault>;
    tokens: TokenInfo[];
}

export function AdminPanel({ vault, tokens }: Props): React.JSX.Element {
    // Fund rewards
    const [fundToken, setFundToken] = useState(vault.selectedToken);
    const [fundAmount, setFundAmount] = useState('');

    // Set reward rate
    const [rateToken, setRateToken] = useState(vault.selectedToken);
    const [rateAmount, setRateAmount] = useState('');

    // Set fees
    const [compoundFee, setCompoundFee] = useState('100');
    const [withdrawFee, setWithdrawFee] = useState('50');

    const handleFund = async (): Promise<void> => {
        if (fundAmount === '') return;
        try {
            const raw = parseTokenAmount(fundAmount, 18);
            const success = await vault.fundRewards(fundToken, raw);
            if (success) setFundAmount('');
        } catch { /* invalid */ }
    };

    const handleSetRate = async (): Promise<void> => {
        if (rateAmount === '') return;
        try {
            const raw = parseTokenAmount(rateAmount, 18);
            const success = await vault.setRewardRate(rateToken, raw);
            if (success) setRateAmount('');
        } catch { /* invalid */ }
    };

    const handleSetFees = async (): Promise<void> => {
        const cBps = BigInt(parseInt(compoundFee, 10) || 0);
        const wBps = BigInt(parseInt(withdrawFee, 10) || 0);
        await vault.setFees(cBps, wBps);
    };

    const currentRewardRate = vault.vaultInfo?.rewardRate ?? 0n;
    const currentCompoundFee = vault.vaultInfo?.compoundFeeBps ?? 100n;
    const currentWithdrawFee = vault.vaultInfo?.withdrawFeeBps ?? 50n;

    return (
        <div className="av-card av-admin">
            <h2 className="av-card__title">Admin Panel</h2>

            {/* Fund Rewards */}
            <div className="av-admin__section">
                <h3 className="av-admin__subtitle">Fund Reward Pool</h3>
                <div className="av-admin__row">
                    <select
                        className="av-select"
                        value={fundToken}
                        onChange={(e) => { setFundToken(e.target.value); }}
                    >
                        {tokens.map((t) => (
                            <option key={t.address} value={t.address}>{t.symbol}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        className="av-input"
                        placeholder="Amount"
                        value={fundAmount}
                        onChange={(e) => { setFundAmount(e.target.value); }}
                    />
                    <button
                        type="button"
                        className="av-btn av-btn--primary"
                        disabled={vault.funding || fundAmount === ''}
                        onClick={() => { void handleFund(); }}
                    >
                        {vault.funding ? 'Funding...' : 'Fund'}
                    </button>
                </div>
                <span className="av-admin__current">
                    Current pool: {formatTokenAmount(vault.vaultInfo?.rewardPool ?? 0n, 18)}
                </span>
            </div>

            {/* Set Reward Rate */}
            <div className="av-admin__section">
                <h3 className="av-admin__subtitle">Set Reward Rate (per block)</h3>
                <div className="av-admin__row">
                    <select
                        className="av-select"
                        value={rateToken}
                        onChange={(e) => { setRateToken(e.target.value); }}
                    >
                        {tokens.map((t) => (
                            <option key={t.address} value={t.address}>{t.symbol}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        className="av-input"
                        placeholder="Rate per block"
                        value={rateAmount}
                        onChange={(e) => { setRateAmount(e.target.value); }}
                    />
                    <button
                        type="button"
                        className="av-btn av-btn--primary"
                        disabled={rateAmount === ''}
                        onClick={() => { void handleSetRate(); }}
                    >
                        Set Rate
                    </button>
                </div>
                <span className="av-admin__current">
                    Current rate: {formatTokenAmount(currentRewardRate, 18)} / block
                </span>
            </div>

            {/* Set Fees */}
            <div className="av-admin__section">
                <h3 className="av-admin__subtitle">Set Fee Rates (BPS)</h3>
                <div className="av-admin__row">
                    <div className="av-admin__fee-input">
                        <label>Compound (bps)</label>
                        <input
                            type="number"
                            className="av-input"
                            placeholder="100"
                            value={compoundFee}
                            onChange={(e) => { setCompoundFee(e.target.value); }}
                            min="0"
                            max="1000"
                        />
                        <span className="av-admin__current">Current: {currentCompoundFee.toString()} ({Number(currentCompoundFee) / 100}%)</span>
                    </div>
                    <div className="av-admin__fee-input">
                        <label>Withdraw (bps)</label>
                        <input
                            type="number"
                            className="av-input"
                            placeholder="50"
                            value={withdrawFee}
                            onChange={(e) => { setWithdrawFee(e.target.value); }}
                            min="0"
                            max="500"
                        />
                        <span className="av-admin__current">Current: {currentWithdrawFee.toString()} ({Number(currentWithdrawFee) / 100}%)</span>
                    </div>
                    <button
                        type="button"
                        className="av-btn av-btn--primary"
                        onClick={() => { void handleSetFees(); }}
                    >
                        Update Fees
                    </button>
                </div>
            </div>
        </div>
    );
}
