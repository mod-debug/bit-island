import { useState, useCallback } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { getKnownCollections, type NftCollectionInfo } from '../config/nftCollections.js';

interface NftCollectionSelectorProps {
    label: string;
    value: string;
    onChange: (address: string) => void;
    disabled?: boolean;
}

export function NftCollectionSelector({ label, value, onChange, disabled = false }: NftCollectionSelectorProps): React.JSX.Element {
    const { network } = useWalletConnect();
    const [showCustom, setShowCustom] = useState(false);

    const collections: NftCollectionInfo[] = network !== null ? getKnownCollections(network) : [];

    const handleSelect = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            const val = e.target.value;
            if (val === '__custom__') {
                setShowCustom(true);
                onChange('');
            } else {
                setShowCustom(false);
                onChange(val);
            }
        },
        [onChange],
    );

    const isKnown = collections.some((c) => c.address.toLowerCase() === value.toLowerCase());
    const selectValue = showCustom ? '__custom__' : (isKnown ? value : (value.length > 0 ? '__custom__' : ''));

    return (
        <div className="form-group">
            <label className="form-label">
                {label} <span className="form-required">*</span>
            </label>
            <select
                className="form-input nft-collection-selector"
                value={selectValue}
                onChange={handleSelect}
                disabled={disabled}
            >
                <option value="" disabled>Select a collection...</option>
                {collections.map((c) => (
                    <option key={c.address} value={c.address}>
                        {c.name} ({c.symbol})
                    </option>
                ))}
                <option value="__custom__">Custom address...</option>
            </select>
            {(showCustom || (!isKnown && value.length > 0)) && (
                <input
                    className="form-input"
                    type="text"
                    placeholder="opt1s... or bc1p... collection address"
                    value={value}
                    onChange={(e) => { onChange(e.target.value); }}
                    disabled={disabled}
                    autoComplete="off"
                    style={{ marginTop: '8px' }}
                />
            )}
        </div>
    );
}
