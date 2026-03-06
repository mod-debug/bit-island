import { useState, useCallback, useRef } from 'react';
import type { TxStep, CreateScheduleParams } from '../../types/index.js';

/** Known testnet tokens for the selector */
const KNOWN_TOKENS = [
    { label: 'Moto', address: 'opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds' },
    { label: 'Pill', address: 'opt1sqp5gx9k0nrqph3sy3aeyzt673dz7ygtqxcfdqfle' },
];

type DurationUnit = 'blocks' | 'days' | 'weeks' | 'months';
type CreateMode = 'single' | 'batch';

const BLOCKS_PER: Record<DurationUnit, number> = {
    blocks: 1,
    days: 144,
    weeks: 1008,
    months: 4320,
};

interface VestingTemplate {
    readonly label: string;
    readonly icon: string;
    readonly cliffValue: string;
    readonly cliffUnit: DurationUnit;
    readonly durationValue: string;
    readonly durationUnit: DurationUnit;
    readonly revocable: boolean;
    readonly vestingType: number;
    readonly stepsCount: number;
}

const TEMPLATES: VestingTemplate[] = [
    { label: 'Team', icon: '\uD83D\uDC65', cliffValue: '12', cliffUnit: 'months', durationValue: '48', durationUnit: 'months', revocable: true, vestingType: 0, stepsCount: 0 },
    { label: 'Advisor', icon: '\uD83C\uDF93', cliffValue: '6', cliffUnit: 'months', durationValue: '24', durationUnit: 'months', revocable: true, vestingType: 0, stepsCount: 0 },
    { label: 'Seed', icon: '\uD83C\uDF31', cliffValue: '6', cliffUnit: 'months', durationValue: '18', durationUnit: 'months', revocable: false, vestingType: 0, stepsCount: 0 },
    { label: 'No Cliff', icon: '\u26A1', cliffValue: '0', cliffUnit: 'days', durationValue: '6', durationUnit: 'months', revocable: false, vestingType: 0, stepsCount: 0 },
    { label: 'Quarterly', icon: '\uD83D\uDCC5', cliffValue: '3', cliffUnit: 'months', durationValue: '12', durationUnit: 'months', revocable: true, vestingType: 1, stepsCount: 4 },
];

interface BatchRow {
    beneficiary: string;
    amount: string;
    cliffValue: string;
    cliffUnit: DurationUnit;
    durationValue: string;
    durationUnit: DurationUnit;
    revocable: boolean;
    error: string | null;
}

function emptyRow(): BatchRow {
    return { beneficiary: '', amount: '', cliffValue: '0', cliffUnit: 'days', durationValue: '6', durationUnit: 'months', revocable: false, error: null };
}

function parseAmount(raw: string): bigint {
    const decimals = 18;
    const parts = raw.split('.');
    const intPart = parts[0] ?? '0';
    const fracPart = (parts[1] ?? '').padEnd(decimals, '0').slice(0, decimals);
    return BigInt(intPart) * (10n ** BigInt(decimals)) + BigInt(fracPart);
}

function validateRow(row: BatchRow): string | null {
    if (row.beneficiary.length <= 10) return 'Invalid beneficiary';
    const amt = parseFloat(row.amount);
    if (isNaN(amt) || amt <= 0) return 'Invalid amount';
    const cliff = BigInt(Math.floor((parseFloat(row.cliffValue) || 0) * BLOCKS_PER[row.cliffUnit]));
    const dur = BigInt(Math.floor((parseFloat(row.durationValue) || 0) * BLOCKS_PER[row.durationUnit]));
    if (dur <= 0n) return 'Duration must be > 0';
    if (cliff > dur) return 'Cliff > duration';
    return null;
}

interface CreateScheduleProps {
    readonly creating: boolean;
    readonly createSteps: TxStep[];
    readonly createError: string | null;
    readonly lastCreatedId: bigint | null;
    readonly awaitingContinue: boolean;
    readonly onConfirmContinue: () => void;
    readonly onCreateSchedule: (params: CreateScheduleParams) => Promise<bigint | null>;
    readonly onReset: () => void;
    readonly walletConnected: boolean;
    readonly onCreateBatch?: (params: CreateScheduleParams[]) => Promise<void>;
    readonly batchCreating?: boolean;
    readonly batchProgress?: { current: number; total: number } | null;
    readonly batchError?: string | null;
}

export function CreateSchedule({
    creating,
    createSteps,
    createError,
    lastCreatedId,
    awaitingContinue,
    onConfirmContinue,
    onCreateSchedule,
    onReset,
    walletConnected,
    onCreateBatch,
    batchCreating = false,
    batchProgress = null,
    batchError = null,
}: CreateScheduleProps): React.JSX.Element {
    const [mode, setMode] = useState<CreateMode>('single');

    // ── Single mode state ──
    const [beneficiary, setBeneficiary] = useState('');
    const [selectedToken, setSelectedToken] = useState(KNOWN_TOKENS[0]?.address ?? '');
    const [customToken, setCustomToken] = useState('');
    const [useCustom, setUseCustom] = useState(false);
    const [amount, setAmount] = useState('');
    const [cliffValue, setCliffValue] = useState('');
    const [cliffUnit, setCliffUnit] = useState<DurationUnit>('days');
    const [durationValue, setDurationValue] = useState('');
    const [durationUnit, setDurationUnit] = useState<DurationUnit>('months');
    const [revocable, setRevocable] = useState(false);
    const [vestingType, setVestingType] = useState(0);
    const [stepsCount, setStepsCount] = useState('4');
    const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

    // ── Batch mode state ──
    const [batchRows, setBatchRows] = useState<BatchRow[]>([emptyRow()]);
    const fileRef = useRef<HTMLInputElement>(null);

    const applyTemplate = useCallback((t: VestingTemplate): void => {
        setCliffValue(t.cliffValue);
        setCliffUnit(t.cliffUnit);
        setDurationValue(t.durationValue);
        setDurationUnit(t.durationUnit);
        setRevocable(t.revocable);
        setVestingType(t.vestingType);
        setStepsCount(t.stepsCount.toString());
        setActiveTemplate(t.label);
    }, []);

    const token = useCustom ? customToken : selectedToken;

    const cliffBlocks = BigInt(Math.floor((parseFloat(cliffValue) || 0) * BLOCKS_PER[cliffUnit]));
    const durationBlocks = BigInt(Math.floor((parseFloat(durationValue) || 0) * BLOCKS_PER[durationUnit]));

    const canSubmit =
        !creating &&
        walletConnected &&
        beneficiary.length > 10 &&
        token.length > 10 &&
        amount.length > 0 &&
        parseFloat(amount) > 0 &&
        durationBlocks > 0n &&
        cliffBlocks <= durationBlocks &&
        (vestingType === 0 || (parseInt(stepsCount) > 0));

    const handleSubmit = useCallback((): void => {
        if (!canSubmit) return;
        const totalAmount = parseAmount(amount);

        void onCreateSchedule({
            beneficiary,
            token,
            totalAmount,
            cliffBlocks,
            durationBlocks,
            revocable,
            vestingType,
            stepsCount: vestingType === 1 ? parseInt(stepsCount) : 0,
        });
    }, [canSubmit, beneficiary, token, amount, cliffBlocks, durationBlocks, revocable, vestingType, stepsCount, onCreateSchedule]);

    // ── Batch helpers ──
    const updateRow = useCallback((idx: number, field: keyof BatchRow, value: string | boolean): void => {
        setBatchRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value, error: null } : r));
    }, []);

    const addRow = useCallback((): void => {
        setBatchRows((prev) => [...prev, emptyRow()]);
    }, []);

    const removeRow = useCallback((idx: number): void => {
        setBatchRows((prev) => prev.length <= 1 ? [emptyRow()] : prev.filter((_, i) => i !== idx));
    }, []);

    const handleCSVImport = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
        const file = e.target.files?.[0];
        if (file === undefined) return;
        const reader = new FileReader();
        reader.onload = (ev): void => {
            const text = ev.target?.result;
            if (typeof text !== 'string') return;
            const lines = text.trim().split('\n');
            const rows: BatchRow[] = [];
            for (let i = 0; i < lines.length; i++) {
                const raw = lines[i];
                if (raw === undefined) continue;
                const line = raw.trim();
                if (line.length === 0 || line.startsWith('beneficiary')) continue; // skip header
                const cols = line.split(',').map((c) => c.trim());
                rows.push({
                    beneficiary: cols[0] ?? '',
                    amount: cols[1] ?? '',
                    cliffValue: cols[2] ?? '0',
                    cliffUnit: 'blocks',
                    durationValue: cols[3] ?? '0',
                    durationUnit: 'blocks',
                    revocable: (cols[4] ?? '').toLowerCase() === 'true',
                    error: null,
                });
            }
            if (rows.length > 0) setBatchRows(rows);
        };
        reader.readAsText(file);
        // Reset so same file can be re-imported
        e.target.value = '';
    }, []);

    const handleBatchSubmit = useCallback((): void => {
        if (onCreateBatch === undefined || !walletConnected || token.length <= 10) return;

        // Validate all rows
        const validated = batchRows.map((r) => ({ ...r, error: validateRow(r) }));
        const hasError = validated.some((r) => r.error !== null);
        setBatchRows(validated);
        if (hasError) return;

        const params: CreateScheduleParams[] = validated.map((r) => ({
            beneficiary: r.beneficiary,
            token,
            totalAmount: parseAmount(r.amount),
            cliffBlocks: BigInt(Math.floor((parseFloat(r.cliffValue) || 0) * BLOCKS_PER[r.cliffUnit])),
            durationBlocks: BigInt(Math.floor((parseFloat(r.durationValue) || 0) * BLOCKS_PER[r.durationUnit])),
            revocable: r.revocable,
            vestingType,
            stepsCount: vestingType === 1 ? parseInt(stepsCount) : 0,
        }));

        void onCreateBatch(params);
    }, [onCreateBatch, walletConnected, token, batchRows, vestingType, stepsCount]);

    const isCompleted = lastCreatedId !== null;

    return (
        <section className="vest-create-section" id="vest-create">
            <div className="vest-create-section__panel">
                <div className="vest-create-section__header">
                    <h2 className="vest-create-section__title">Create Vesting Schedule</h2>
                    <p className="vest-create-section__desc">
                        Lock tokens for a beneficiary. They will vest over time after the cliff period.
                    </p>
                </div>

            <div className="vest-create-section__body">
            {/* Mode toggle */}
            <div className="vest-mode-toggle">
                <button
                    className={`vest-mode-btn ${mode === 'single' ? 'vest-mode-btn--active' : ''}`}
                    onClick={() => setMode('single')}
                    disabled={creating || batchCreating}
                >
                    Single
                </button>
                <button
                    className={`vest-mode-btn ${mode === 'batch' ? 'vest-mode-btn--active' : ''}`}
                    onClick={() => setMode('batch')}
                    disabled={creating || batchCreating}
                >
                    Batch
                </button>
            </div>

            {isCompleted && mode === 'single' ? (
                <div className="vest-create-success">
                    <div className="vest-create-success__icon">&#127820;</div>
                    <h3>Schedule #{lastCreatedId.toString()} Created!</h3>
                    <p>Tokens are now locked in Monkey Vesting.</p>
                    <button className="btn btn--primary btn--sm" onClick={onReset}>
                        Create Another
                    </button>
                </div>
            ) : mode === 'single' ? (
                <div className="vest-create-form">
                    {/* Templates */}
                    <div className="vest-template-row">
                        <span className="vest-template-label">Templates:</span>
                        {TEMPLATES.map((t) => (
                            <button
                                key={t.label}
                                className={`vest-template-btn ${activeTemplate === t.label ? 'vest-template-btn--active' : ''}`}
                                onClick={() => { applyTemplate(t); }}
                                disabled={creating}
                                title={`${t.cliffValue} ${t.cliffUnit} cliff, ${t.durationValue} ${t.durationUnit} duration${t.revocable ? ', revocable' : ''}${t.vestingType === 1 ? `, ${t.stepsCount} steps` : ''}`}
                            >
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Beneficiary */}
                    <div className="vest-form-group">
                        <label className="vest-form-label">Beneficiary Address</label>
                        <input
                            className="vest-form-input"
                            type="text"
                            placeholder="opt1p... (bech32 address)"
                            value={beneficiary}
                            onChange={(e) => setBeneficiary(e.target.value)}
                            disabled={creating}
                        />
                        <span className="vest-form-hint">The wallet that will receive vested tokens</span>
                    </div>

                    {/* Token */}
                    <div className="vest-form-group">
                        <label className="vest-form-label">Token</label>
                        {!useCustom ? (
                            <div className="vest-token-select-group">
                                <select
                                    className="vest-form-select"
                                    value={selectedToken}
                                    onChange={(e) => setSelectedToken(e.target.value)}
                                    disabled={creating}
                                >
                                    {KNOWN_TOKENS.map((t) => (
                                        <option key={t.address} value={t.address}>
                                            {t.label}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    className="vest-form-toggle"
                                    onClick={() => setUseCustom(true)}
                                    disabled={creating}
                                >
                                    Custom
                                </button>
                            </div>
                        ) : (
                            <div className="vest-token-select-group">
                                <input
                                    className="vest-form-input"
                                    type="text"
                                    placeholder="opt1s... (token contract address)"
                                    value={customToken}
                                    onChange={(e) => setCustomToken(e.target.value)}
                                    disabled={creating}
                                />
                                <button
                                    className="vest-form-toggle"
                                    onClick={() => setUseCustom(false)}
                                    disabled={creating}
                                >
                                    Known
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Amount */}
                    <div className="vest-form-group">
                        <label className="vest-form-label">Total Amount</label>
                        <input
                            className="vest-form-input"
                            type="text"
                            placeholder="1000"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                            disabled={creating}
                        />
                    </div>

                    {/* Vesting Type */}
                    <div className="vest-form-group">
                        <label className="vest-form-label">Vesting Type</label>
                        <div className="vest-type-toggle">
                            <button
                                className={`vest-type-btn ${vestingType === 0 ? 'vest-type-btn--active' : ''}`}
                                onClick={() => setVestingType(0)}
                                disabled={creating}
                            >
                                Linear
                            </button>
                            <button
                                className={`vest-type-btn ${vestingType === 1 ? 'vest-type-btn--active' : ''}`}
                                onClick={() => setVestingType(1)}
                                disabled={creating}
                            >
                                Stepped
                            </button>
                        </div>
                        {vestingType === 1 && (
                            <div className="vest-steps-input">
                                <label className="vest-form-hint">Number of steps:</label>
                                <input
                                    className="vest-form-input vest-form-input--short"
                                    type="number"
                                    min="1"
                                    value={stepsCount}
                                    onChange={(e) => setStepsCount(e.target.value)}
                                    disabled={creating}
                                />
                                <span className="vest-form-hint">
                                    Tokens unlock in {stepsCount} equal chunks
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Cliff */}
                    <div className="vest-form-group">
                        <label className="vest-form-label">Cliff Period</label>
                        <div className="vest-duration-group">
                            <input
                                className="vest-form-input vest-form-input--short"
                                type="text"
                                placeholder="0"
                                value={cliffValue}
                                onChange={(e) => setCliffValue(e.target.value.replace(/[^0-9.]/g, ''))}
                                disabled={creating}
                            />
                            <select
                                className="vest-form-select vest-form-select--unit"
                                value={cliffUnit}
                                onChange={(e) => setCliffUnit(e.target.value as DurationUnit)}
                                disabled={creating}
                            >
                                <option value="blocks">blocks</option>
                                <option value="days">days (~144 blk)</option>
                                <option value="weeks">weeks (~1,008 blk)</option>
                                <option value="months">months (~4,320 blk)</option>
                            </select>
                        </div>
                        <span className="vest-form-hint">
                            No tokens vest before the cliff. = {cliffBlocks.toLocaleString()} blocks
                        </span>
                    </div>

                    {/* Duration */}
                    <div className="vest-form-group">
                        <label className="vest-form-label">Total Vesting Duration</label>
                        <div className="vest-duration-group">
                            <input
                                className="vest-form-input vest-form-input--short"
                                type="text"
                                placeholder="12"
                                value={durationValue}
                                onChange={(e) => setDurationValue(e.target.value.replace(/[^0-9.]/g, ''))}
                                disabled={creating}
                            />
                            <select
                                className="vest-form-select vest-form-select--unit"
                                value={durationUnit}
                                onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
                                disabled={creating}
                            >
                                <option value="blocks">blocks</option>
                                <option value="days">days (~144 blk)</option>
                                <option value="weeks">weeks (~1,008 blk)</option>
                                <option value="months">months (~4,320 blk)</option>
                            </select>
                        </div>
                        <span className="vest-form-hint">
                            Total vesting period. = {durationBlocks.toLocaleString()} blocks
                        </span>
                        {cliffBlocks > durationBlocks && (
                            <span className="vest-form-error">Cliff cannot exceed total duration</span>
                        )}
                    </div>

                    {/* Revocable */}
                    <div className="vest-form-group vest-form-group--toggle">
                        <label className="vest-form-label">Revocable</label>
                        <div className="vest-toggle-row">
                            <button
                                className={`vest-toggle ${revocable ? 'vest-toggle--on' : ''}`}
                                onClick={() => setRevocable(!revocable)}
                                disabled={creating}
                            >
                                <span className="vest-toggle__thumb" />
                            </button>
                            <span className="vest-form-hint">
                                {revocable
                                    ? 'You can revoke and reclaim unvested tokens at any time.'
                                    : 'Once created, the schedule cannot be revoked. Tokens are permanently locked.'}
                            </span>
                        </div>
                    </div>

                    {/* Steps progress (shown during creation) */}
                    {creating && (
                        <div className="vest-steps">
                            {createSteps.map((step, i) => (
                                <div key={i} className={`vest-step vest-step--${step.status}`}>
                                    <span className="vest-step__dot" />
                                    <span className="vest-step__label">{step.label}</span>
                                    {step.status === 'pending' && <span className="vest-step__spinner" />}
                                    {step.status === 'done' && <span className="vest-step__check">&#10003;</span>}
                                    {step.status === 'error' && <span className="vest-step__x">&#10007;</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Continue button (between step 2 and 3) */}
                    {awaitingContinue && (
                        <div className="vest-continue" id="continue-sign">
                            <p className="vest-continue__text">
                                Approval confirmed on-chain. Ready for the final signature.
                            </p>
                            <button className="btn btn--banana-flash btn--lg" onClick={onConfirmContinue}>
                                Continue &amp; Sign
                            </button>
                        </div>
                    )}

                    {createError !== null && (
                        <div className="vest-form-error-box">
                            <p>{createError}</p>
                            <button className="btn btn--ghost btn--sm" onClick={onReset}>Reset</button>
                        </div>
                    )}

                    {/* Submit */}
                    {!creating && !awaitingContinue && (
                        <button
                            className="btn btn--banana-flash btn--lg vest-create-submit"
                            disabled={!canSubmit}
                            onClick={handleSubmit}
                        >
                            {!walletConnected ? 'Connect Wallet' : 'Lock Tokens'}
                        </button>
                    )}
                </div>
            ) : mode === 'batch' ? (
                <div className="vest-create-form">
                    {/* Shared token selector */}
                    <div className="vest-form-group">
                        <label className="vest-form-label">Token (shared for all rows)</label>
                        {!useCustom ? (
                            <div className="vest-token-select-group">
                                <select
                                    className="vest-form-select"
                                    value={selectedToken}
                                    onChange={(e) => setSelectedToken(e.target.value)}
                                    disabled={batchCreating}
                                >
                                    {KNOWN_TOKENS.map((t) => (
                                        <option key={t.address} value={t.address}>{t.label}</option>
                                    ))}
                                </select>
                                <button className="vest-form-toggle" onClick={() => setUseCustom(true)} disabled={batchCreating}>Custom</button>
                            </div>
                        ) : (
                            <div className="vest-token-select-group">
                                <input className="vest-form-input" type="text" placeholder="opt1s..." value={customToken} onChange={(e) => setCustomToken(e.target.value)} disabled={batchCreating} />
                                <button className="vest-form-toggle" onClick={() => setUseCustom(false)} disabled={batchCreating}>Known</button>
                            </div>
                        )}
                    </div>

                    {/* Vesting Type (shared) */}
                    <div className="vest-form-group">
                        <label className="vest-form-label">Vesting Type (shared)</label>
                        <div className="vest-type-toggle">
                            <button className={`vest-type-btn ${vestingType === 0 ? 'vest-type-btn--active' : ''}`} onClick={() => setVestingType(0)} disabled={batchCreating}>Linear</button>
                            <button className={`vest-type-btn ${vestingType === 1 ? 'vest-type-btn--active' : ''}`} onClick={() => setVestingType(1)} disabled={batchCreating}>Stepped</button>
                        </div>
                        {vestingType === 1 && (
                            <div className="vest-steps-input">
                                <label className="vest-form-hint">Steps:</label>
                                <input className="vest-form-input vest-form-input--short" type="number" min="1" value={stepsCount} onChange={(e) => setStepsCount(e.target.value)} disabled={batchCreating} />
                            </div>
                        )}
                    </div>

                    {/* CSV Import */}
                    <div className="vest-batch-actions">
                        <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()} disabled={batchCreating}>
                            Import CSV
                        </button>
                        <button className="btn btn--ghost btn--sm" onClick={addRow} disabled={batchCreating}>
                            + Add Row
                        </button>
                        <button className="btn btn--ghost btn--sm" onClick={() => setBatchRows([emptyRow()])} disabled={batchCreating}>
                            Clear All
                        </button>
                        <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVImport} style={{ display: 'none' }} />
                    </div>

                    <div className="vest-form-hint" style={{ marginBottom: '0.5rem' }}>
                        CSV format: beneficiary,amount,cliff_blocks,duration_blocks,revocable
                    </div>

                    {/* Batch table */}
                    <div className="vest-batch-table">
                        <div className="vest-batch-header">
                            <span>Beneficiary</span>
                            <span>Amount</span>
                            <span>Cliff</span>
                            <span>Duration</span>
                            <span>Rev.</span>
                            <span></span>
                        </div>
                        {batchRows.map((row, idx) => (
                            <div key={idx} className={`vest-batch-row ${row.error !== null ? 'vest-batch-row--error' : ''}`}>
                                <input
                                    className="vest-form-input vest-form-input--sm"
                                    placeholder="opt1p..."
                                    value={row.beneficiary}
                                    onChange={(e) => updateRow(idx, 'beneficiary', e.target.value)}
                                    disabled={batchCreating}
                                />
                                <input
                                    className="vest-form-input vest-form-input--sm"
                                    placeholder="1000"
                                    value={row.amount}
                                    onChange={(e) => updateRow(idx, 'amount', e.target.value.replace(/[^0-9.]/g, ''))}
                                    disabled={batchCreating}
                                />
                                <div className="vest-batch-dur">
                                    <input
                                        className="vest-form-input vest-form-input--xs"
                                        value={row.cliffValue}
                                        onChange={(e) => updateRow(idx, 'cliffValue', e.target.value)}
                                        disabled={batchCreating}
                                    />
                                    <select className="vest-form-select--xs" value={row.cliffUnit} onChange={(e) => updateRow(idx, 'cliffUnit', e.target.value)} disabled={batchCreating}>
                                        <option value="blocks">blk</option>
                                        <option value="days">d</option>
                                        <option value="weeks">w</option>
                                        <option value="months">mo</option>
                                    </select>
                                </div>
                                <div className="vest-batch-dur">
                                    <input
                                        className="vest-form-input vest-form-input--xs"
                                        value={row.durationValue}
                                        onChange={(e) => updateRow(idx, 'durationValue', e.target.value)}
                                        disabled={batchCreating}
                                    />
                                    <select className="vest-form-select--xs" value={row.durationUnit} onChange={(e) => updateRow(idx, 'durationUnit', e.target.value)} disabled={batchCreating}>
                                        <option value="blocks">blk</option>
                                        <option value="days">d</option>
                                        <option value="weeks">w</option>
                                        <option value="months">mo</option>
                                    </select>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={row.revocable}
                                    onChange={(e) => updateRow(idx, 'revocable', e.target.checked)}
                                    disabled={batchCreating}
                                />
                                <button className="vest-batch-remove" onClick={() => removeRow(idx)} disabled={batchCreating} title="Remove row">
                                    &#10005;
                                </button>
                                {row.error !== null && <span className="vest-batch-row-error">{row.error}</span>}
                            </div>
                        ))}
                    </div>

                    {/* Batch progress */}
                    {batchCreating && batchProgress !== null && (
                        <div className="vest-batch-progress">
                            Creating schedule {batchProgress.current} of {batchProgress.total}...
                        </div>
                    )}

                    {batchError !== null && (
                        <div className="vest-form-error-box"><p>{batchError}</p></div>
                    )}

                    {/* Batch submit */}
                    {!batchCreating && onCreateBatch !== undefined && (
                        <button
                            className="btn btn--banana-flash btn--lg vest-create-submit"
                            disabled={!walletConnected || token.length <= 10 || batchRows.length === 0}
                            onClick={handleBatchSubmit}
                        >
                            Create All ({batchRows.length} schedules)
                        </button>
                    )}

                    {onCreateBatch === undefined && (
                        <div className="vest-form-hint" style={{ textAlign: 'center', marginTop: '1rem' }}>
                            Batch creation coming soon...
                        </div>
                    )}
                </div>
            ) : null}
            </div>{/* end vest-create-section__body */}
            </div>{/* end vest-create-section__panel */}
        </section>
    );
}
