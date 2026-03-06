import type { useAutoVault } from '../../hooks/useAutoVault.js';

interface Props {
    vault: ReturnType<typeof useAutoVault>;
}

export function FeeTransparency({ vault }: Props): React.JSX.Element {
    const compoundFeeBps = vault.vaultInfo?.compoundFeeBps ?? 100n;
    const withdrawFeeBps = vault.vaultInfo?.withdrawFeeBps ?? 50n;

    return (
        <div className="av-card av-fees">
            <h3 className="av-card__title av-card__title--small">Fee Structure</h3>
            <div className="av-fees__grid">
                <div className="av-fees__item">
                    <span className="av-fees__label">Compound Fee</span>
                    <span className="av-fees__value">{Number(compoundFeeBps) / 100}%</span>
                    <span className="av-fees__desc">Applied to rewards on each compound</span>
                </div>
                <div className="av-fees__item">
                    <span className="av-fees__label">Withdrawal Fee</span>
                    <span className="av-fees__value">{Number(withdrawFeeBps) / 100}%</span>
                    <span className="av-fees__desc">Applied to gross amount on withdrawal</span>
                </div>
            </div>
            <p className="av-fees__note">
                Fees fund protocol development and security. Max caps: 10% compound, 5% withdrawal.
            </p>
        </div>
    );
}
