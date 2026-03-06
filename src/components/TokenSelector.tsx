import { useState, useRef, useEffect, useCallback } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { getKnownTokens, type TokenInfo } from '../config/tokens.js';

interface TokenSelectorProps {
    /** Current token address value */
    value: string;
    /** Called when user selects a token or enters a custom address */
    onChange: (address: string) => void;
    /** Disable interactions */
    disabled?: boolean;
    /** Placeholder for custom address input */
    placeholder?: string;
    /** Label displayed above selector */
    label: string;
}

export function TokenSelector({
    value,
    onChange,
    disabled = false,
    placeholder = 'opt1… contract address',
    label,
}: TokenSelectorProps): React.JSX.Element {
    const { network } = useWalletConnect();
    const [isOpen, setIsOpen] = useState(false);
    const [isCustom, setIsCustom] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const tokens = network !== null ? getKnownTokens(network) : [];

    // Find currently selected token (if any)
    const selectedToken = tokens.find(
        (t) => t.address.toLowerCase() === value.toLowerCase(),
    );

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent): void => {
            if (dropdownRef.current !== null && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => { document.removeEventListener('mousedown', handleClick); };
    }, []);

    const handleSelect = useCallback((token: TokenInfo): void => {
        onChange(token.address);
        setIsCustom(false);
        setIsOpen(false);
    }, [onChange]);

    const handleCustom = useCallback((): void => {
        setIsCustom(true);
        setIsOpen(false);
        onChange('');
    }, [onChange]);

    return (
        <div className="form-group">
            <label className="form-label">
                {label} <span className="form-required">*</span>
            </label>
            <div className="token-selector" ref={dropdownRef}>
                {/* Selected display / trigger */}
                {!isCustom && !isOpen ? (
                    <button
                        type="button"
                        className="token-selector__trigger"
                        onClick={() => { if (!disabled) setIsOpen(true); }}
                        disabled={disabled}
                    >
                        {selectedToken !== undefined ? (
                            <span className="token-selector__selected">
                                {selectedToken.icon !== undefined ? (
                                    <img className="token-selector__icon" src={selectedToken.icon} alt={selectedToken.symbol} />
                                ) : (
                                    <span className="token-selector__dot" style={{ background: selectedToken.color }} />
                                )}
                                <span className="token-selector__symbol">{selectedToken.symbol}</span>
                                <span className="token-selector__name">{selectedToken.name}</span>
                            </span>
                        ) : (
                            <span className="token-selector__placeholder">Select a token</span>
                        )}
                        <span className="token-selector__chevron">&#9662;</span>
                    </button>
                ) : null}

                {/* Custom address input */}
                {isCustom && !isOpen ? (
                    <div className="token-selector__custom">
                        <input
                            className="form-input form-input--mono"
                            type="text"
                            placeholder={placeholder}
                            value={value}
                            onChange={(e) => { onChange(e.target.value); }}
                            disabled={disabled}
                            autoComplete="off"
                            spellCheck={false}
                            autoFocus
                        />
                        <button
                            type="button"
                            className="token-selector__back"
                            onClick={() => { setIsCustom(false); setIsOpen(true); }}
                            disabled={disabled}
                            title="Back to token list"
                        >
                            &#x2190;
                        </button>
                    </div>
                ) : null}

                {/* Dropdown */}
                {isOpen && (
                    <div className="token-selector__dropdown">
                        {tokens.map((token) => (
                            <button
                                key={token.address}
                                type="button"
                                className={[
                                    'token-selector__option',
                                    token.address.toLowerCase() === value.toLowerCase()
                                        ? 'token-selector__option--active'
                                        : '',
                                ].filter(Boolean).join(' ')}
                                onClick={() => { handleSelect(token); }}
                            >
                                {token.icon !== undefined ? (
                                    <img className="token-selector__icon" src={token.icon} alt={token.symbol} />
                                ) : (
                                    <span className="token-selector__dot" style={{ background: token.color }} />
                                )}
                                <span className="token-selector__option-symbol">{token.symbol}</span>
                                <span className="token-selector__option-name">{token.name}</span>
                            </button>
                        ))}
                        <button
                            type="button"
                            className="token-selector__option token-selector__option--custom"
                            onClick={handleCustom}
                        >
                            <span className="token-selector__dot" style={{ background: '#666' }} />
                            <span className="token-selector__option-symbol">Custom</span>
                            <span className="token-selector__option-name">Paste token address</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
