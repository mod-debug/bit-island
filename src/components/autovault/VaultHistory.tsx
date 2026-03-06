import { useState } from 'react';
import type { useAutoVault } from '../../hooks/useAutoVault.js';
import { formatTokenAmount } from '../../utils/tokenAmount.js';

/** Copy text to clipboard and return true on success */
function copyToClipboard(text: string): Promise<boolean> {
    return navigator.clipboard.writeText(text).then(() => true, () => false);
}

interface Props {
    vault: ReturnType<typeof useAutoVault>;
}

function timeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

const ACTION_LABELS: Record<string, string> = {
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    compound: 'Compound',
    fund: 'Fund Rewards',
    'set-rate': 'Set Rate',
    'set-fees': 'Set Fees',
};

const STEP_ICONS: Record<string, string> = {
    idle: '\u23F3',
    pending: '\u{1F7E1}',
    done: '\u2705',
};

const MEMPOOL_TX = 'https://mempool.opnet.org/fr/testnet4/tx/';
const OPSCAN_TX = 'https://opscan.org/transactions/';

/** SVG copy icon (two overlapping sheets) */
function CopyIcon(): React.JSX.Element {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
    );
}

export function VaultHistory({ vault }: Props): React.JSX.Element {
    const { history, depositing, depositSteps, withdrawing, withdrawSteps, compounding, compoundSteps } = vault;
    const [copiedTxId, setCopiedTxId] = useState<string | null>(null);

    const handleCopy = async (txId: string): Promise<void> => {
        const ok = await copyToClipboard(txId);
        if (ok) {
            setCopiedTxId(txId);
            setTimeout(() => { setCopiedTxId(null); }, 2000);
        }
    };

    const hasPending = depositing || withdrawing || compounding;

    return (
        <div id="av-history">
            {/* ═══ PENDING TRANSACTIONS (purple glowing panel) ═══ */}
            {hasPending && (
                <div className="pending-standalone" id="pending-section">
                    <h3 className="pending-standalone__title">Pending Transactions</h3>

                    {depositing && depositSteps.length > 0 && (
                        <div className="av-pending-flow">
                            <div className="av-pending-flow__label">Deposit</div>
                            <div className="av-pending-flow__steps">
                                {depositSteps.map((step, i) => (
                                    <div
                                        key={i}
                                        className={`av-pending-step av-pending-step--${step.status}`}
                                    >
                                        <span className="av-pending-step__icon">
                                            {STEP_ICONS[step.status] ?? '\u23F3'}
                                        </span>
                                        <span className="av-pending-step__label">{step.label}</span>
                                        {step.txId !== undefined && (
                                            <span className="av-pending-step__tx-wrap">
                                                <span className="av-tx-hash">{step.txId.slice(0, 8)}...</span>
                                                <button
                                                    type="button"
                                                    className="av-tx-action"
                                                    title="Copy transaction ID"
                                                    onClick={() => { void handleCopy(step.txId as string); }}
                                                >
                                                    {copiedTxId === step.txId ? '\u2705' : <CopyIcon />}
                                                </button>
                                                <a href={`${OPSCAN_TX}${step.txId}?network=op_testnet`} target="_blank" rel="noopener noreferrer" className="av-tx-action" title="View on OPNet Explorer">
                                                    <img src="/images/opnet-icon.png" alt="OPNet" className="av-tx-icon" />
                                                </a>
                                                <a href={`${MEMPOOL_TX}${step.txId}`} target="_blank" rel="noopener noreferrer" className="av-tx-action" title="View on Mempool">
                                                    <img src="/images/mempool-icon.png" alt="Mempool" className="av-tx-icon" />
                                                </a>
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {withdrawing && withdrawSteps.length > 0 && (
                        <div className="av-pending-flow">
                            <div className="av-pending-flow__label">Withdraw</div>
                            <div className="av-pending-flow__steps">
                                {withdrawSteps.map((step, i) => (
                                    <div key={i} className={`av-pending-step av-pending-step--${step.status}`}>
                                        <span className="av-pending-step__icon">
                                            {STEP_ICONS[step.status] ?? '\u23F3'}
                                        </span>
                                        <span className="av-pending-step__label">{step.label}</span>
                                        {step.txId !== undefined && (
                                            <span className="av-pending-step__tx-wrap">
                                                <span className="av-tx-hash">{step.txId.slice(0, 8)}...</span>
                                                <button type="button" className="av-tx-action" title="Copy transaction ID" onClick={() => { void handleCopy(step.txId as string); }}>
                                                    {copiedTxId === step.txId ? '\u2705' : <CopyIcon />}
                                                </button>
                                                <a href={`${OPSCAN_TX}${step.txId}?network=op_testnet`} target="_blank" rel="noopener noreferrer" className="av-tx-action" title="View on OPNet Explorer">
                                                    <img src="/images/opnet-icon.png" alt="OPNet" className="av-tx-icon" />
                                                </a>
                                                <a href={`${MEMPOOL_TX}${step.txId}`} target="_blank" rel="noopener noreferrer" className="av-tx-action" title="View on Mempool">
                                                    <img src="/images/mempool-icon.png" alt="Mempool" className="av-tx-icon" />
                                                </a>
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {compounding && compoundSteps.length > 0 && (
                        <div className="av-pending-flow">
                            <div className="av-pending-flow__label">Compound</div>
                            <div className="av-pending-flow__steps">
                                {compoundSteps.map((step, i) => (
                                    <div key={i} className={`av-pending-step av-pending-step--${step.status}`}>
                                        <span className="av-pending-step__icon">
                                            {STEP_ICONS[step.status] ?? '\u23F3'}
                                        </span>
                                        <span className="av-pending-step__label">{step.label}</span>
                                        {step.txId !== undefined && (
                                            <span className="av-pending-step__tx-wrap">
                                                <span className="av-tx-hash">{step.txId.slice(0, 8)}...</span>
                                                <button type="button" className="av-tx-action" title="Copy transaction ID" onClick={() => { void handleCopy(step.txId as string); }}>
                                                    {copiedTxId === step.txId ? '\u2705' : <CopyIcon />}
                                                </button>
                                                <a href={`${OPSCAN_TX}${step.txId}?network=op_testnet`} target="_blank" rel="noopener noreferrer" className="av-tx-action" title="View on OPNet Explorer">
                                                    <img src="/images/opnet-icon.png" alt="OPNet" className="av-tx-icon" />
                                                </a>
                                                <a href={`${MEMPOOL_TX}${step.txId}`} target="_blank" rel="noopener noreferrer" className="av-tx-action" title="View on Mempool">
                                                    <img src="/images/mempool-icon.png" alt="Mempool" className="av-tx-icon" />
                                                </a>
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ HISTORY TABLE ═══ */}
            <div className="av-card av-history">
                <h2 className="av-card__title">Vault History</h2>
                {history.length === 0 ? (
                    <p className="av-history__empty">No transactions yet.</p>
                ) : (
                    <div className="av-history__table-wrap">
                        <table className="av-history__table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Action</th>
                                    <th>Token</th>
                                    <th>Amount</th>
                                    <th>Fee</th>
                                    <th>TxId</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((entry) => (
                                    <tr key={entry.id}>
                                        <td className="av-history__time">{timeAgo(entry.timestamp)}</td>
                                        <td>
                                            <span className={`av-history__action av-history__action--${entry.action}`}>
                                                {ACTION_LABELS[entry.action] ?? entry.action}
                                            </span>
                                        </td>
                                        <td>{entry.tokenSymbol}</td>
                                        <td className="av-history__amount">
                                            {formatTokenAmount(entry.amount, 18)}
                                        </td>
                                        <td className="av-history__fee">
                                            {entry.fee > 0n ? formatTokenAmount(entry.fee, 18) : '-'}
                                        </td>
                                        <td>
                                            {entry.txId.length > 0 ? (
                                                <span className="av-pending-step__tx-wrap">
                                                    <span className="av-tx-hash">{entry.txId.slice(0, 8)}...</span>
                                                    <button
                                                        type="button"
                                                        className="av-tx-action"
                                                        title="Copy transaction ID"
                                                        onClick={() => { void handleCopy(entry.txId); }}
                                                    >
                                                        {copiedTxId === entry.txId ? '\u2705' : <CopyIcon />}
                                                    </button>
                                                    <a href={`${OPSCAN_TX}${entry.txId}?network=op_testnet`} target="_blank" rel="noopener noreferrer" className="av-tx-action" title="View on OPNet Explorer">
                                                        <img src="/images/opnet-icon.png" alt="OPNet" className="av-tx-icon" />
                                                    </a>
                                                    <a href={`${MEMPOOL_TX}${entry.txId}`} target="_blank" rel="noopener noreferrer" className="av-tx-action" title="View on Mempool">
                                                        <img src="/images/mempool-icon.png" alt="Mempool" className="av-tx-icon" />
                                                    </a>
                                                </span>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
