import type { useAutoVault } from '../../hooks/useAutoVault.js';
import type { TokenInfo } from '../../config/tokens.js';
import { formatTokenAmount } from '../../utils/tokenAmount.js';
import { findTokenByAddress } from '../../config/tokens.js';
import { useWalletConnect } from '@btc-vision/walletconnect';

interface Props {
    vault: ReturnType<typeof useAutoVault>;
    tokens: TokenInfo[];
}

export function UserPosition({ vault, tokens }: Props): React.JSX.Element {
    const { walletAddress, network } = useWalletConnect();

    const selectedTokenInfo = network !== null
        ? findTokenByAddress(vault.selectedToken, network)
        : tokens[0];
    const symbol = selectedTokenInfo?.symbol ?? '???';
    const decimals = selectedTokenInfo?.decimals ?? 18;

    const shares = vault.userInfo?.shares ?? 0n;
    const stakedEquivalent = vault.userInfo?.stakedEquivalent ?? 0n;
    const pendingRewardShare = vault.userInfo?.pendingRewardShare ?? 0n;
    const hasPosition = shares > 0n;

    const handleWithdrawAll = async (): Promise<void> => {
        if (shares === 0n) return;
        await vault.withdraw(vault.selectedToken, shares);
    };

    if (walletAddress === null || walletAddress === undefined) {
        return (
            <div className="av-card av-position">
                <h2 className="av-card__title">My Position</h2>
                <div className="av-position__empty">
                    <p>Connect your wallet to see your position.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="av-card av-position">
            <h2 className="av-card__title">My Position</h2>

            {!hasPosition ? (
                <div className="av-position__empty">
                    <p>No active position. Deposit tokens to start earning.</p>
                </div>
            ) : (
                <>
                    <div className="av-position__stats">
                        <div className="av-stat">
                            <span className="av-stat__label">My Shares</span>
                            <span className="av-stat__value">
                                {formatTokenAmount(shares, decimals)}
                            </span>
                        </div>

                        <div className="av-stat">
                            <span className="av-stat__label">Value ({symbol})</span>
                            <span className="av-stat__value av-stat__value--highlight">
                                {formatTokenAmount(stakedEquivalent, decimals)} {symbol}
                            </span>
                        </div>

                        <div className="av-stat">
                            <span className="av-stat__label">Pending Rewards (my share)</span>
                            <span className="av-stat__value av-stat__value--orange">
                                +{formatTokenAmount(pendingRewardShare, decimals)} {symbol}
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="av-btn av-btn--secondary av-btn--full"
                        disabled={vault.withdrawing || shares === 0n}
                        onClick={() => { void handleWithdrawAll(); }}
                    >
                        {vault.withdrawing ? 'Withdrawing...' : 'Withdraw All'}
                    </button>
                </>
            )}
        </div>
    );
}
