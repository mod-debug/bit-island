import { useState, useMemo } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useTxHistory } from '../../stores/txHistoryStore.js';
import { usePendingFlows, type PendingFlow } from '../../stores/pendingFlowStore.js';
import type { TxHistoryEntry } from '../../types/index.js';

const MEMPOOL_BASE = 'https://mempool.opnet.org/fr/testnet4';
const OPSCAN_BASE = 'https://opscan.org';
const OPSCAN_NET = 'op_testnet';

const VAULT_ACTION_LABELS: Record<string, { text: string; cls: string }> = {
    approve: { text: 'Approve', cls: 'tx-action--approve' },
    create: { text: 'Create', cls: 'tx-action--create' },
    accept: { text: 'Claim', cls: 'tx-action--accept' },
    cancel: { text: 'Revoke', cls: 'tx-action--cancel' },
};

const STAGE_LABELS: Record<string, { text: string; cls: string }> = {
    approved: { text: 'Approved', cls: 'pending-flow__stage--approved' },
    confirming: { text: 'Approve - waiting for confirmation', cls: 'pending-flow__stage--confirming' },
    ready: { text: 'Create Schedule', cls: 'pending-flow__stage--ready' },
    finalizing: { text: 'Finalizing', cls: 'pending-flow__stage--finalizing' },
};

function isVaultEntry(entry: TxHistoryEntry): boolean {
    const d = entry.detail.toLowerCase();
    if (d.includes('monkey vault') || d.includes('deposit') || d.includes('withdraw') || d.includes('compound')) return false;
    return d.includes('vesting') || d.includes('banana vault');
}

function isVaultFlow(flow: PendingFlow): boolean {
    const d = (flow.description ?? '').toLowerCase();
    return d.includes('vesting') || flow.id.startsWith('vault-');
}

function formatTxTime(ts: number): string {
    const date = new Date(ts);
    return date.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function shortTxId(txId: string): string {
    if (txId.length <= 16) return txId;
    return `${txId.slice(0, 8)}\u2026${txId.slice(-6)}`;
}

function timeSince(ts: number): string {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function CopyTxBtn({ txId }: { readonly txId: string }): React.JSX.Element {
    const [copied, setCopied] = useState(false);
    const handleCopy = (): void => {
        void navigator.clipboard.writeText(txId).then(() => {
            setCopied(true);
            setTimeout(() => { setCopied(false); }, 2000);
        });
    };
    return (
        <button className="tx-row__copy" onClick={handleCopy} title="Copy TX ID">
            {copied ? '\u2713' : '\u29C9'}
        </button>
    );
}

interface VaultTxRowProps {
    readonly entry: TxHistoryEntry;
}

function VaultTxRow({ entry }: VaultTxRowProps): React.JSX.Element {
    const actionInfo = VAULT_ACTION_LABELS[entry.action] ?? { text: entry.action, cls: '' };
    const [copied, setCopied] = useState(false);

    const copyTxId = (): void => {
        void navigator.clipboard.writeText(entry.txId).then(() => {
            setCopied(true);
            setTimeout(() => { setCopied(false); }, 2000);
        });
    };

    return (
        <tr className={`tx-row ${entry.status === 'error' ? 'tx-row--error' : ''}`}>
            <td className="tx-row__time">
                {formatTxTime(entry.timestamp)}
                <span className="tx-row__relative">{timeSince(entry.timestamp)}</span>
            </td>
            <td className="tx-row__action-cell">
                <span className={`tx-row__action ${entry.status === 'error' ? 'tx-action--failed' : actionInfo.cls}`}>
                    {actionInfo.text}
                </span>
            </td>
            <td className="tx-row__deal">
                {entry.dealId !== null ? `#${entry.dealId.toString()}` : '\u2014'}
            </td>
            <td className="tx-row__detail">{entry.detail}</td>
            <td className="tx-row__txid">
                {entry.txId.length > 0 ? (
                    <span className="tx-row__txid-wrap">
                        <code title={entry.txId}>{shortTxId(entry.txId)}</code>
                        <button onClick={copyTxId} className="tx-row__copy" title="Copy TX ID">
                            {copied ? '\u2713' : '\u29C9'}
                        </button>
                    </span>
                ) : (
                    <span className="tx-row__na">\u2014</span>
                )}
            </td>
            <td className="tx-row__links">
                {entry.txId.length > 0 && (
                    <>
                        <a href={`${OPSCAN_BASE}/transactions/${entry.txId}?network=${OPSCAN_NET}`} target="_blank" rel="noopener noreferrer" title="View on OPScan"><img src="/images/opnet-icon.png" alt="OPScan" className="tx-explorer-icon" /></a>
                        <a href={`${MEMPOOL_BASE}/tx/${entry.txId}`} target="_blank" rel="noopener noreferrer" title="View on Mempool"><img src="/images/mempool-icon.png" alt="Mempool" className="tx-explorer-icon" /></a>
                    </>
                )}
            </td>
            <td className="tx-row__status-icon">
                {entry.status === 'ok' ? '\u2713' : '\u2717'}
            </td>
        </tr>
    );
}

/* ─── Pending flow row ─── */

interface PendingFlowRowProps {
    readonly flow: PendingFlow;
    readonly onContinue: () => void;
    readonly onResume: (flow: PendingFlow) => void;
    readonly awaitingContinue: boolean;
    readonly claimBusy: boolean;
    readonly creating: boolean;
    readonly batchCreating: boolean;
    readonly batchProgress: { current: number; total: number } | null;
    readonly resumingFlowId: string | null;
}

const FLOW_TYPE_LABELS: Record<string, { text: string; cls: string }> = {
    create: { text: 'Create', cls: 'tx-action--create' },
    accept: { text: 'Accept', cls: 'tx-action--accept' },
    claim: { text: 'Claim', cls: 'tx-action--accept' },
    revoke: { text: 'Revoke', cls: 'tx-action--cancel' },
};

/** Step status inside the expandable stepper */
type StepStatus = 'done' | 'active' | 'upcoming';

interface FlowStep {
    readonly label: string;
    readonly status: StepStatus;
    readonly spinning: boolean;
}

/** Compute the 4-step progress for a multi-step vault flow */
function getVaultFlowSteps(flow: PendingFlow): FlowStep[] {
    const stage = flow.stage;
    const step2Done = stage === 'ready' || stage === 'finalizing';
    const step2Active = stage === 'approved' || stage === 'confirming';
    const step3Done = stage === 'finalizing';
    const step3Active = stage === 'ready';
    const step4Active = stage === 'finalizing';

    return [
        { label: 'Approve', status: 'done', spinning: false },
        { label: 'Confirmation Approve', status: step2Active ? 'active' : step2Done ? 'done' : 'upcoming', spinning: step2Active },
        { label: 'Schedule TX', status: step3Active ? 'active' : step3Done ? 'done' : 'upcoming', spinning: false },
        { label: 'Confirmation Schedule', status: step4Active ? 'active' : 'upcoming', spinning: step4Active },
    ];
}

function VaultPendingRow({ flow, onContinue, onResume, awaitingContinue, claimBusy, creating, batchCreating, batchProgress, resumingFlowId }: PendingFlowRowProps): React.JSX.Element {
    const isReady = flow.stage === 'ready';
    const isFinalizing = flow.stage === 'finalizing';
    const isClaim = flow.type === 'claim';
    const isRevoke = flow.type === 'revoke';

    // For claims: only treat as "in-flight single step" when actually finalizing
    // Claims in 'ready' stage should show a Claim button
    const isInFlightSingle = (isClaim || isRevoke) && isFinalizing;

    // Stage label: claims in ready show "Ready to Claim"
    const stageInfo = isClaim && isReady
        ? { text: 'Ready to Claim', cls: 'pending-flow__stage--ready' }
        : isClaim && isFinalizing
            ? { text: 'Confirming', cls: 'pending-flow__stage--finalizing' }
            : (STAGE_LABELS[flow.stage] ?? { text: flow.stage, cls: '' });

    const displayTxId = isFinalizing && flow.finalizeTxId !== undefined ? flow.finalizeTxId : flow.approveTxId;
    const typeInfo = FLOW_TYPE_LABELS[flow.type] ?? { text: flow.type, cls: '' };

    // Stepper: only for multi-step create flows (not claims, not revokes)
    const noStepper = isClaim || isRevoke;
    const [stepperOpen, setStepperOpen] = useState(false);
    const flowSteps = noStepper ? [] : getVaultFlowSteps(flow);
    const isBatchFlow = flow.id.startsWith('vault-batch-');
    const isThisResuming = resumingFlowId === flow.id;
    const showBatchProgress = isBatchFlow && isThisResuming && batchProgress !== null;

    // Busy = any operation that blocks the Claim/Confirm button
    const busy = creating || batchCreating || claimBusy;
    const canContinue = isReady && !isInFlightSingle && !busy;

    const handleContinue = (): void => {
        if (isClaim) {
            // Claims always route to onResume (which calls executeQueuedClaim)
            onResume(flow);
        } else if (awaitingContinue) {
            onContinue();
        } else {
            onResume(flow);
        }
    };

    const toggleStepper = (): void => {
        if (!noStepper) setStepperOpen((v) => !v);
    };

    return (
        <tr className="pending-flow">
            <td className="pending-flow__time">{timeSince(flow.startedAt)}</td>
            <td className="pending-flow__type">
                <span className={`tx-row__action ${typeInfo.cls}`}>{typeInfo.text}</span>
            </td>
            <td className="pending-flow__desc">
                {flow.description ?? '\u2014'}
            </td>
            <td className="pending-flow__stage-cell">
                <span
                    className={`pending-flow__stage ${isInFlightSingle ? 'pending-flow__stage--finalizing' : stageInfo.cls}${(isInFlightSingle || noStepper) ? '' : ' pending-flow__stage--expandable'}`}
                    onClick={toggleStepper}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleStepper(); }}
                    role={noStepper ? undefined : 'button'}
                    tabIndex={noStepper ? undefined : 0}
                >
                    {(isInFlightSingle || flow.stage === 'confirming' || (isFinalizing && !isClaim)) && <span className="btn__spinner" />}
                    {isInFlightSingle ? 'Confirming' : stageInfo.text}
                    {!(isInFlightSingle || noStepper) && <span className="flow-stepper__chevron">{stepperOpen ? ' \u25BE' : ' \u25B8'}</span>}
                </span>
                {stepperOpen && flowSteps.length > 0 && (
                    <div className="flow-stepper">
                        {flowSteps.map((step, i) => (
                            <div key={i} className={`flow-stepper__step flow-stepper__step--${step.status}`}>
                                <div className="flow-stepper__track">
                                    <span className="flow-stepper__icon">
                                        {step.status === 'done' && '\u2713'}
                                        {step.status === 'active' && step.spinning && <span className="btn__spinner flow-stepper__spinner" />}
                                        {step.status === 'active' && !step.spinning && <span className="flow-stepper__pulse" />}
                                        {step.status === 'upcoming' && '\u25CB'}
                                    </span>
                                    {i < flowSteps.length - 1 && <span className="flow-stepper__connector" />}
                                </div>
                                <span className="flow-stepper__label">{step.label}</span>
                            </div>
                        ))}
                    </div>
                )}
            </td>
            <td className="pending-flow__txid">
                <span className="tx-row__txid-wrap">
                    <code title={displayTxId}>{shortTxId(displayTxId)}</code>
                    {displayTxId.length > 0 && <CopyTxBtn txId={displayTxId} />}
                    {displayTxId.length > 0 && (
                        <a href={`${OPSCAN_BASE}/transactions/${displayTxId}?network=${OPSCAN_NET}`} target="_blank" rel="noopener noreferrer" className="pending-flow__links" title="View on OPScan"><img src="/images/opnet-icon.png" alt="OPScan" className="tx-explorer-icon" /></a>
                    )}
                    {displayTxId.length > 0 && (
                        <a href={`${MEMPOOL_BASE}/tx/${displayTxId}`} target="_blank" rel="noopener noreferrer" className="pending-flow__links" title="View on Mempool"><img src="/images/mempool-icon.png" alt="Mempool" className="tx-explorer-icon" /></a>
                    )}
                </span>
            </td>
            <td className="pending-flow__actions">
                {(isFinalizing || isInFlightSingle) ? (
                    showBatchProgress ? (
                        <span className="pending-flow__wait-label">
                            <span className="btn__spinner" /> Signing {batchProgress.current}/{batchProgress.total}
                        </span>
                    ) : (
                        <span className="pending-flow__wait-label">Waiting for confirmation...</span>
                    )
                ) : (
                    <button
                        className="btn btn--primary btn--xs"
                        disabled={!canContinue}
                        onClick={handleContinue}
                        title={canContinue ? (isClaim ? 'Execute this claim' : 'Resume and finalize this transaction') : 'Waiting\u2026'}
                    >
                        {isThisResuming ? (
                            <><span className="btn__spinner" /> Signing...</>
                        ) : canContinue ? (
                            isClaim ? 'Claim' : 'Confirm'
                        ) : isReady ? (
                            isClaim ? 'Claim' : 'Confirm'
                        ) : (
                            <><span className="btn__spinner" /> Confirming...</>
                        )}
                    </button>
                )}
            </td>
        </tr>
    );
}

/* ─── Main component ─── */

interface VaultTxHistoryProps {
    readonly awaitingContinue: boolean;
    readonly onConfirmContinue: () => void;
    readonly onResumeFlow: (flow: PendingFlow) => void;
    readonly creating: boolean;
    readonly batchCreating: boolean;
    readonly batchProgress: { current: number; total: number } | null;
    readonly resumingFlowId: string | null;
    readonly claimBusy: boolean;
}

const MAX_VISIBLE_ROWS = 10;

export function VaultTxHistory({ awaitingContinue, onConfirmContinue, onResumeFlow, creating, batchCreating, batchProgress, resumingFlowId, claimBusy }: VaultTxHistoryProps): React.JSX.Element {
    const { walletAddress } = useWalletConnect();
    const allHistory = useTxHistory();
    const allFlows = usePendingFlows();
    const [expanded, setExpanded] = useState(false);

    const vaultPendingFlows = useMemo(() => {
        if (walletAddress === null || walletAddress === undefined) return [];
        const lower = walletAddress.toLowerCase();
        return allFlows.filter(
            (f) => f.walletAddress.toLowerCase() === lower && isVaultFlow(f),
        );
    }, [allFlows, walletAddress]);

    if (walletAddress === null || walletAddress === undefined) {
        return <></>;
    }

    const walletLower = walletAddress.toLowerCase();
    const vaultHistory = allHistory.filter(
        (e) => isVaultEntry(e) && e.walletAddress.toLowerCase() === walletLower,
    );

    const hasPending = vaultPendingFlows.length > 0;
    const hasHistory = vaultHistory.length > 0;
    const hiddenCount = vaultHistory.length - MAX_VISIBLE_ROWS;
    const visibleHistory = expanded ? vaultHistory : vaultHistory.slice(0, MAX_VISIBLE_ROWS);

    if (!hasPending && !hasHistory) {
        return (
            <section className="otc-section vault-tx-section" id="vault-history">
                <div className="section-header">
                    <div className="section-tag">Vault</div>
                    <h2 className="section-title">
                        Transaction <span className="text-accent vault-accent">History</span>
                    </h2>
                </div>
                <div className="offers-empty">
                    <span className="offers-empty__icon">&#127820;</span>
                    <p className="offers-empty__text">No vault transactions yet.</p>
                    <p className="offers-empty__sub">Your vesting transaction history will appear here.</p>
                </div>
            </section>
        );
    }

    return (
        <section className="otc-section vault-tx-section" id="vault-history">
            <div className="section-header">
                <div className="section-tag">Vault</div>
                <h2 className="section-title">
                    Transaction <span className="text-accent vault-accent">History</span>
                </h2>
                <p className="section-sub">
                    Every vault interaction — approvals, schedules, claims, and revocations.
                </p>
            </div>

            {/* ─── Pending Flows ─── */}
            {hasPending && (
                <>
                    <div className="pending-flow__info">
                        <strong>PENDING</strong> — These transactions are awaiting on-chain confirmation or your action.
                        <span className="pending-flow__ttl">Auto-cleared after 24h</span>
                    </div>
                    <div className="tx-history__table-wrap">
                        <table className="tx-history__table pending-flow__table">
                            <thead>
                                <tr>
                                    <th>Started</th>
                                    <th>Type</th>
                                    <th>Description</th>
                                    <th>Stage</th>
                                    <th>TX</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vaultPendingFlows.map((flow) => (
                                    <VaultPendingRow
                                        key={flow.id}
                                        flow={flow}
                                        onContinue={onConfirmContinue}
                                        onResume={onResumeFlow}
                                        awaitingContinue={awaitingContinue}
                                        claimBusy={claimBusy}
                                        creating={creating}
                                        batchCreating={batchCreating}
                                        batchProgress={batchProgress}
                                        resumingFlowId={resumingFlowId}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* ─── Completed History ─── */}
            {hasHistory && (
                <div className="tx-history__table-wrap">
                    <table className="tx-history__table">
                        <thead>
                            <tr>
                                <th>Date / Time</th>
                                <th>Action</th>
                                <th>Schedule</th>
                                <th>Details</th>
                                <th>TX ID</th>
                                <th>Explorer</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleHistory.map((entry) => (
                                <VaultTxRow key={entry.id} entry={entry} />
                            ))}
                        </tbody>
                    </table>
                    {hiddenCount > 0 && (
                        <div className="tx-history__expand">
                            <button
                                className="tx-history__expand-btn"
                                onClick={() => { setExpanded(!expanded); }}
                            >
                                {expanded
                                    ? 'Show less'
                                    : `Show ${hiddenCount} more transaction${hiddenCount > 1 ? 's' : ''}`}
                                <span className={`tx-history__expand-arrow ${expanded ? 'tx-history__expand-arrow--up' : ''}`} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
