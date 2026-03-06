import { useAutoVault } from '../../hooks/useAutoVault.js';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { getKnownTokens } from '../../config/tokens.js';
import { ADMIN_WALLET } from '../../config/contracts.js';
import { formatTokenAmount } from '../../utils/tokenAmount.js';
import { VaultOverview } from './VaultOverview.js';
import { DepositWithdrawPanel } from './DepositWithdrawPanel.js';
import { UserPosition } from './UserPosition.js';
import { CompoundButton } from './CompoundButton.js';
import { VaultHistory } from './VaultHistory.js';
import { FeeTransparency } from './FeeTransparency.js';
import { AdminPanel } from './AdminPanel.js';
import { FirefliesCanvas } from './FirefliesCanvas.js';
import { networks } from '@btc-vision/bitcoin';

export function AutoVaultDashboard(): React.JSX.Element {
    const { walletAddress, network } = useWalletConnect();
    const vault = useAutoVault();

    // Default to testnet tokens when wallet is not connected
    const effectiveNetwork = network ?? networks.opnetTestnet;
    const tokens = getKnownTokens(effectiveNetwork);

    const isAdmin = walletAddress !== null
        && walletAddress !== undefined
        && walletAddress.toLowerCase() === ADMIN_WALLET.toLowerCase();

    // Auto-select first token if none selected
    if (vault.selectedToken === '' && tokens.length > 0 && tokens[0] !== undefined) {
        vault.setSelectedToken(tokens[0].address);
    }

    return (
        <main className="av">
            <FirefliesCanvas bitcoinRain />
            {/* Hero */}
            <section className="av__hero">
                <div className="av__hero-bg" />
                <div className="av__hero-content">
                    <div className="hero__badge">Bitcoin L1 &bull; OPNet &bull; Auto-Compound</div>
                    <div className="vault-chest-wrap" aria-hidden="true">
                        <img
                            src="/images/vault-chest.png"
                            alt=""
                            className="vault-chest-icon"
                        />
                    </div>
                    <h1 className="av__title">
                        Revenue <span className="av__title-accent">Vault</span>
                    </h1>
                    <p className="av__subtitle">
                        Stake your tokens and earn compounding rewards on Bitcoin L1.<br />
                        Deposit. Compound. Grow. All trustless, all on-chain.
                    </p>
                    <div className="hero__cta-group">
                        <a href="#av-deposit" className="btn btn--vault-flash btn--lg">
                            Deposit
                        </a>
                        <a href="#av-withdraw" className="btn btn--primary btn--lg">
                            Withdraw
                        </a>
                    </div>
                    <div className="hero__pills">
                        <span className="hero__pill">Auto-compound</span>
                        <span className="hero__pill">Revenue sharing</span>
                        <span className="hero__pill">Quantum-resistant</span>
                    </div>
                </div>
                <div className="hero__scroll-hint" aria-hidden="true">
                    <span className="hero__scroll-arrow" />
                </div>
            </section>

            {/* Stats bar */}
            <section className="stats-bar av__stats-bar" aria-label="Vault stats">
                <div className="stat-item">
                    <span className="stat-item__value">
                        {formatTokenAmount(vault.vaultInfo?.totalStaked ?? 0n, 18)}
                    </span>
                    <span className="stat-item__label">TVL</span>
                </div>
                <div className="stat-item">
                    <span className="stat-item__value stat-item__value--green">
                        {vault.vaultInfo !== null && vault.vaultInfo.totalStaked > 0n
                            ? `${(Number(vault.vaultInfo.rewardRate * 52560n * 10000n / vault.vaultInfo.totalStaked) / 100).toFixed(2)}%`
                            : '0.00%'}
                    </span>
                    <span className="stat-item__label">APY</span>
                </div>
                <div className="stat-item">
                    <span className="stat-item__value">
                        {vault.sharePrice !== null
                            ? (Number(vault.sharePrice) / 1e18).toFixed(4)
                            : '1.0000'}
                    </span>
                    <span className="stat-item__label">Share Price</span>
                </div>
                <div className="stat-item">
                    <span className="stat-item__value stat-item__value--orange">
                        {formatTokenAmount(vault.pendingRewards ?? 0n, 18)}
                    </span>
                    <span className="stat-item__label">Pending Rewards</span>
                </div>
                <div className="stat-item">
                    <span className="stat-item__value">
                        {vault.currentBlock > 0n ? vault.currentBlock.toString() : '—'}
                    </span>
                    <span className="stat-item__label">Current Block</span>
                </div>
            </section>

            {/* Pending banner */}
            {(vault.depositing || vault.withdrawing || vault.compounding) && (
                <div className="av__pending-banner">
                    <span className="av__pending-banner-icon">{'\u{1F7E1}'}</span>
                    <span className="av__pending-banner-text">
                        Transaction in progress&hellip;
                    </span>
                    <button
                        type="button"
                        className="av__pending-banner-link"
                        onClick={() => {
                            const el = document.getElementById('pending-section');
                            if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                    >
                        View pending &darr;
                    </button>
                </div>
            )}

            {vault.selectedToken !== '' ? (
                <>
                    {/* Main 3-column grid */}
                    <section className="av__grid">
                        <DepositWithdrawPanel
                            vault={vault}
                            tokens={tokens}
                        />
                        <div className="av__center">
                            <VaultOverview vault={vault} />
                            <CompoundButton vault={vault} />
                            <FeeTransparency vault={vault} />
                        </div>
                        <UserPosition vault={vault} tokens={tokens} />
                    </section>

                    {/* History */}
                    <section className="av__section">
                        <VaultHistory vault={vault} />
                    </section>

                    {/* Admin Panel */}
                    {isAdmin && (
                        <section className="av__section">
                            <AdminPanel vault={vault} tokens={tokens} />
                        </section>
                    )}
                </>
            ) : (
                <div className="av__empty">
                    <p>Loading vault...</p>
                </div>
            )}
        </main>
    );
}
