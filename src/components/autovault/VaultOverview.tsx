import { formatTokenAmount } from '../../utils/tokenAmount.js';
import type { useAutoVault } from '../../hooks/useAutoVault.js';

interface Props {
    vault: ReturnType<typeof useAutoVault>;
}

/** Estimated blocks per year on Bitcoin (~10 min per block) */
const BLOCKS_PER_YEAR = 52_560n;

export function VaultOverview({ vault }: Props): React.JSX.Element {
    const { vaultInfo, sharePrice, pendingRewards, currentBlock, loading } = vault;

    const totalStaked = vaultInfo?.totalStaked ?? 0n;
    const rewardRate = vaultInfo?.rewardRate ?? 0n;
    const rewardPool = vaultInfo?.rewardPool ?? 0n;
    const lastCompoundBlock = vaultInfo?.lastCompoundBlock ?? 0n;
    const compoundFeeBps = vaultInfo?.compoundFeeBps ?? 100n;
    const withdrawFeeBps = vaultInfo?.withdrawFeeBps ?? 50n;

    // APY calculation
    let apyGross = 0;
    let apyNet = 0;
    if (totalStaked > 0n && rewardRate > 0n) {
        const yearlyRewards = rewardRate * BLOCKS_PER_YEAR;
        apyGross = Number((yearlyRewards * 10000n) / totalStaked) / 100;
        apyNet = apyGross * (1 - Number(compoundFeeBps) / 10000);
    }

    const blocksSinceCompound = currentBlock > lastCompoundBlock
        ? currentBlock - lastCompoundBlock
        : 0n;

    const sharePriceFormatted = sharePrice !== null
        ? (Number(sharePrice) / 1e18).toFixed(6)
        : '1.000000';

    return (
        <div className="av-card av-overview">
            <h2 className="av-card__title">Vault Overview</h2>

            {loading && vaultInfo === null ? (
                <div className="av-skeleton">Loading vault data...</div>
            ) : (
                <div className="av-overview__stats">
                    <div className="av-stat">
                        <span className="av-stat__label">TVL (Total Staked)</span>
                        <span className="av-stat__value av-stat__value--highlight">
                            {formatTokenAmount(totalStaked, 18)}
                        </span>
                    </div>

                    <div className="av-stat">
                        <span className="av-stat__label">APY (Gross / Net)</span>
                        <span className="av-stat__value av-stat__value--green">
                            {apyGross.toFixed(2)}% / {apyNet.toFixed(2)}%
                        </span>
                    </div>

                    <div className="av-stat">
                        <span className="av-stat__label">Share Price</span>
                        <span className="av-stat__value">{sharePriceFormatted}</span>
                    </div>

                    <div className="av-stat">
                        <span className="av-stat__label">Reward Pool</span>
                        <span className="av-stat__value">
                            {formatTokenAmount(rewardPool, 18)}
                        </span>
                    </div>

                    <div className="av-stat">
                        <span className="av-stat__label">Reward Rate / Block</span>
                        <span className="av-stat__value">
                            {formatTokenAmount(rewardRate, 18)}
                        </span>
                    </div>

                    <div className="av-stat">
                        <span className="av-stat__label">Pending Rewards</span>
                        <span className="av-stat__value av-stat__value--orange">
                            {formatTokenAmount(pendingRewards ?? 0n, 18)}
                        </span>
                    </div>

                    <div className="av-stat">
                        <span className="av-stat__label">Last Compound</span>
                        <span className="av-stat__value">
                            {lastCompoundBlock > 0n
                                ? `Block #${lastCompoundBlock.toString()} (${blocksSinceCompound.toString()} blocks ago)`
                                : 'Never'}
                        </span>
                    </div>

                    <div className="av-stat">
                        <span className="av-stat__label">Fees</span>
                        <span className="av-stat__value">
                            Compound: {Number(compoundFeeBps) / 100}% | Withdraw: {Number(withdrawFeeBps) / 100}%
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
