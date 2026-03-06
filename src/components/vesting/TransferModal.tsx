import { useState, useCallback } from 'react';
import type { VestingSchedule } from '../../types/index.js';
import { formatTokenAmount } from '../../utils/tokenAmount.js';
import { vestingService } from '../../services/VestingVaultService.js';

interface TransferModalProps {
    readonly schedule: VestingSchedule;
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly onConfirm: (schedule: VestingSchedule, newBeneficiary: string) => Promise<boolean>;
    readonly transferring: boolean;
}

/**
 * Modal for transferring vesting schedule beneficiary rights.
 */
export function TransferModal({
    schedule,
    isOpen,
    onClose,
    onConfirm,
    transferring,
}: TransferModalProps): React.JSX.Element | null {
    const [newAddress, setNewAddress] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [tokenSymbol, setTokenSymbol] = useState<string>('...');
    const [decimals, setDecimals] = useState<number>(18);
    const [loaded, setLoaded] = useState(false);

    // Resolve token metadata once
    if (!loaded) {
        setLoaded(true);
        void vestingService.resolveTokenSymbol(schedule.token).then(setTokenSymbol);
        void vestingService.resolveTokenDecimals(schedule.token).then(setDecimals);
    }

    const validate = useCallback((): string | null => {
        const trimmed = newAddress.trim();
        if (trimmed.length === 0) return 'Enter a beneficiary address';
        if (trimmed.toLowerCase() === schedule.beneficiary.toLowerCase()) {
            return 'New address must be different from current beneficiary';
        }
        // Basic bech32 format check
        if (!trimmed.startsWith('bc1') && !trimmed.startsWith('opt1') && !trimmed.startsWith('bcrt1')) {
            return 'Invalid address format (expected bech32)';
        }
        return null;
    }, [newAddress, schedule.beneficiary]);

    const handleConfirm = useCallback(async (): Promise<void> => {
        const validationError = validate();
        if (validationError !== null) {
            setError(validationError);
            return;
        }
        setError(null);
        const success = await onConfirm(schedule, newAddress.trim());
        if (success) {
            setNewAddress('');
            onClose();
        }
    }, [validate, onConfirm, schedule, newAddress, onClose]);

    if (!isOpen) return null;

    const remaining = schedule.totalAmount - schedule.claimedAmount;

    return (
        <div className="vest-modal-overlay" onClick={onClose}>
            <div className="vest-modal" onClick={(e) => { e.stopPropagation(); }}>
                <div className="vest-modal__header">
                    <h3 className="vest-modal__title">Transfer Vesting Schedule</h3>
                    <button className="vest-modal__close" onClick={onClose}>&times;</button>
                </div>

                <div className="vest-transfer-warning">
                    This action is irreversible. The new beneficiary will receive all future vesting rights for this schedule.
                </div>

                <div className="vest-transfer-summary">
                    <div className="vest-transfer-summary__row">
                        <span className="vest-transfer-summary__label">Schedule</span>
                        <span className="vest-transfer-summary__value">#{schedule.id.toString()}</span>
                    </div>
                    <div className="vest-transfer-summary__row">
                        <span className="vest-transfer-summary__label">Token</span>
                        <span className="vest-transfer-summary__value">{tokenSymbol}</span>
                    </div>
                    <div className="vest-transfer-summary__row">
                        <span className="vest-transfer-summary__label">Remaining</span>
                        <span className="vest-transfer-summary__value">
                            {formatTokenAmount(remaining, decimals)} {tokenSymbol}
                        </span>
                    </div>
                    <div className="vest-transfer-summary__row">
                        <span className="vest-transfer-summary__label">Current Beneficiary</span>
                        <span className="vest-transfer-summary__value vest-transfer-summary__addr">
                            {schedule.beneficiary.slice(0, 10)}...{schedule.beneficiary.slice(-6)}
                        </span>
                    </div>
                </div>

                <div className="vest-transfer-input-group">
                    <label className="vest-transfer-input-label" htmlFor="transfer-new-addr">
                        New Beneficiary Address
                    </label>
                    <input
                        id="transfer-new-addr"
                        className="vest-transfer-input"
                        type="text"
                        placeholder="opt1p... or bc1p..."
                        value={newAddress}
                        onChange={(e) => { setNewAddress(e.target.value); setError(null); }}
                        disabled={transferring}
                    />
                    {error !== null && (
                        <p className="vest-transfer-error">{error}</p>
                    )}
                </div>

                <div className="vest-modal__actions">
                    <button
                        className="btn btn--ghost btn--sm"
                        onClick={onClose}
                        disabled={transferring}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn btn--sm vest-card__transfer-btn vest-transfer-confirm-btn"
                        onClick={() => { void handleConfirm(); }}
                        disabled={transferring || newAddress.trim().length === 0}
                    >
                        {transferring ? 'Transferring...' : 'Confirm Transfer'}
                    </button>
                </div>
            </div>
        </div>
    );
}
