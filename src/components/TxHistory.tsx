import { useState } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useTxHistory } from '../stores/txHistoryStore.js';
import type { TxHistoryEntry } from '../types/index.js';

const MEMPOOL_BASE = 'https://mempool.opnet.org/fr/testnet4';
const OPSCAN_BASE = 'https://opscan.org';
const OPSCAN_NET = 'op_testnet';

const ACTION_LABELS: Record<string, { text: string; cls: string }> = {
    approve: { text: 'Approve', cls: 'tx-action--approve' },
    create: { text: 'Create', cls: 'tx-action--create' },
    accept: { text: 'Accept', cls: 'tx-action--accept' },
    cancel: { text: 'Cancel', cls: 'tx-action--cancel' },
};

function formatTxTime(ts: number): string {
    const date = new Date(ts);
    return date.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function shortTxId(txId: string): string {
    if (txId.length <= 16) return txId;
    return `${txId.slice(0, 8)}…${txId.slice(-6)}`;
}

interface TxHistoryRowProps {
    entry: TxHistoryEntry;
}

function TxHistoryRow({ entry }: TxHistoryRowProps): React.JSX.Element {
    const actionInfo = ACTION_LABELS[entry.action] ?? { text: entry.action, cls: '' };
    const [copied, setCopied] = useState(false);

    const copyTxId = (): void => {
        void navigator.clipboard.writeText(entry.txId).then(() => {
            setCopied(true);
            setTimeout(() => { setCopied(false); }, 2000);
        });
    };

    return (
        <tr className={`tx-row ${entry.status === 'error' ? 'tx-row--error' : ''}`}>
            <td className="tx-row__time">{formatTxTime(entry.timestamp)}</td>
            <td className="tx-row__action-cell">
                <span className={`tx-row__action ${entry.status === 'error' ? 'tx-action--failed' : actionInfo.cls}`}>{actionInfo.text}</span>
            </td>
            <td className="tx-row__deal">
                {entry.dealId !== null ? `#${entry.dealId.toString()}` : '—'}
            </td>
            <td className="tx-row__detail">{entry.detail}</td>
            <td className="tx-row__txid">
                {entry.txId.length > 0 ? (
                    <span className="tx-row__txid-wrap">
                        <code title={entry.txId}>{shortTxId(entry.txId)}</code>
                        <button onClick={copyTxId} className="tx-row__copy" title="Copy full TX ID">
                            {copied ? '\u2713' : '\u29C9'}
                        </button>
                    </span>
                ) : (
                    <span className="tx-row__na">—</span>
                )}
            </td>
            <td className="tx-row__links">
                {entry.txId.length > 0 && (
                    <>
                        <a
                            href={`${OPSCAN_BASE}/transactions/${entry.txId}?network=${OPSCAN_NET}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View on OPScan"
                        >
                            OPScan
                        </a>
                        <a
                            href={`${MEMPOOL_BASE}/tx/${entry.txId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View on Mempool"
                        >
                            Mempool
                        </a>
                    </>
                )}
            </td>
            <td className="tx-row__status-icon">
                {entry.status === 'ok' ? '\u2713' : '\u2717'}
            </td>
        </tr>
    );
}

export function TxHistory(): React.JSX.Element {
    const { walletAddress } = useWalletConnect();
    const allHistory = useTxHistory();

    if (walletAddress === null || walletAddress === undefined) {
        return <></>;
    }

    const walletLower = walletAddress.toLowerCase();
    const txHistory = allHistory.filter(
        (e) => e.walletAddress.toLowerCase() === walletLower,
    );

    return (
        <section className="otc-section" id="history">
            <div className="section-header">
                <div className="section-tag">Historic</div>
                <h2 className="section-title">
                    Transaction <span className="text-accent">History</span>
                </h2>
                <p className="section-sub">
                    Every interaction recorded — approvals, creations, swaps, and cancellations.
                </p>
            </div>

            {txHistory.length === 0 ? (
                <div className="offers-empty">
                    <span className="offers-empty__icon">📋</span>
                    <p className="offers-empty__text">No transactions yet.</p>
                    <p className="offers-empty__sub">Your transaction history will appear here after your first deal.</p>
                </div>
            ) : (
                <div className="tx-history__table-wrap">
                    <table className="tx-history__table">
                        <thead>
                            <tr>
                                <th>Date / Time</th>
                                <th>Action</th>
                                <th>Deal</th>
                                <th>Details</th>
                                <th>TX ID</th>
                                <th>Explorer</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {txHistory.map((entry) => (
                                <TxHistoryRow key={entry.id} entry={entry} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
