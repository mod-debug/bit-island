import type { useAutoVault } from '../../hooks/useAutoVault.js';
import { formatTokenAmount } from '../../utils/tokenAmount.js';

interface Props {
    vault: ReturnType<typeof useAutoVault>;
}

export function CompoundButton({ vault }: Props): React.JSX.Element {
    const pending = vault.pendingRewards ?? 0n;
    const hasPending = pending > 0n;

    const handleCompound = async (): Promise<void> => {
        await vault.compound(vault.selectedToken);
    };

    return (
        <div className="av-card av-compound">
            <div className="av-compound__info">
                <span className="av-compound__label">Pending Rewards</span>
                <span className={`av-compound__amount${hasPending ? ' av-compound__amount--active' : ''}`}>
                    {formatTokenAmount(pending, 18)}
                </span>
            </div>
            <button
                type="button"
                className={`av-btn av-btn--compound av-btn--full${hasPending ? ' av-btn--pulse' : ''}`}
                disabled={vault.compounding || !hasPending}
                onClick={() => { void handleCompound(); }}
            >
                {vault.compounding ? 'Compounding...' : 'Compound Now'}
            </button>
            {vault.compoundError !== null && (
                <p className="av-error">{vault.compoundError}</p>
            )}
            <p className="av-compound__hint">
                Anyone can call compound. Rewards are added to the vault pool (minus {vault.vaultInfo !== null ? `${Number(vault.vaultInfo.compoundFeeBps) / 100}%` : '1%'} fee).
            </p>
        </div>
    );
}
