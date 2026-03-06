import { useState, useCallback, useMemo } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { nftEscrowService } from '../services/NFTEscrowService.js';

interface FetchResult {
    tokenIds: bigint[];
    collectionName: string;
    forCollection: string;
    forWallet: string;
}

interface NftTokenPickerProps {
    collectionAddress: string;
    selectedTokenId: bigint | null;
    onSelect: (tokenId: bigint) => void;
    disabled?: boolean;
}

/**
 * Fetches tokens on mount and when deps change via a callback trigger pattern
 * (avoids setState-in-effect lint issues).
 */
function useFetchNftTokens(collectionAddress: string, walletAddress: string | null | undefined): {
    fetchResult: FetchResult | null;
    loading: boolean;
    triggerFetch: () => void;
} {
    const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
    const [loading, setLoading] = useState(false);

    const triggerFetch = useCallback(() => {
        if (collectionAddress.length < 10 || walletAddress === null || walletAddress === undefined) return;

        setLoading(true);
        const addr = collectionAddress;
        const wallet = walletAddress;

        void (async () => {
            try {
                const [ids, name] = await Promise.all([
                    nftEscrowService.getNftOwnerTokens(addr, wallet),
                    nftEscrowService.resolveCollectionName(addr),
                ]);
                setFetchResult({ tokenIds: ids, collectionName: name, forCollection: addr, forWallet: wallet });
            } finally {
                setLoading(false);
            }
        })();
    }, [collectionAddress, walletAddress]);

    return { fetchResult, loading, triggerFetch };
}

export function NftTokenPicker({ collectionAddress, selectedTokenId, onSelect, disabled = false }: NftTokenPickerProps): React.JSX.Element {
    const { walletAddress } = useWalletConnect();
    const { fetchResult, loading, triggerFetch } = useFetchNftTokens(collectionAddress, walletAddress);
    const [manualId, setManualId] = useState('');
    const [hasFetched, setHasFetched] = useState(false);

    const isValid = collectionAddress.length >= 10 && walletAddress !== null && walletAddress !== undefined;

    // Trigger fetch when collection/wallet changes
    const fetchKey = `${collectionAddress}|${walletAddress ?? ''}`;
    const [prevFetchKey, setPrevFetchKey] = useState('');
    if (fetchKey !== prevFetchKey) {
        setPrevFetchKey(fetchKey);
        if (isValid) {
            triggerFetch();
            setHasFetched(true);
        } else {
            setHasFetched(false);
        }
    }

    // Only show data that matches the current collection — ignore stale results
    const tokenIds = useMemo(() => {
        if (!isValid || fetchResult === null || fetchResult.forCollection !== collectionAddress) return [];
        return fetchResult.tokenIds;
    }, [isValid, fetchResult, collectionAddress]);

    const collectionName = useMemo(() => {
        if (!isValid || fetchResult === null || fetchResult.forCollection !== collectionAddress) return '';
        return fetchResult.collectionName;
    }, [isValid, fetchResult, collectionAddress]);

    const handleManualSubmit = (): void => {
        const parsed = manualId.trim();
        if (parsed.length === 0) return;
        try {
            onSelect(BigInt(parsed));
        } catch { /* ignore invalid */ }
    };

    if (collectionAddress.length < 10) {
        return <div className="nft-token-picker__empty">Select a collection first</div>;
    }

    return (
        <div className="nft-token-picker">
            {collectionName.length > 0 && (
                <div className="nft-token-picker__header">
                    <span className="nft-token-picker__collection-name">{collectionName}</span>
                    <span className="nft-token-picker__badge">OP-721</span>
                </div>
            )}

            {loading && (
                <div className="nft-token-picker__loading">
                    <span className="btn__spinner" /> Loading your NFTs...
                </div>
            )}

            {!loading && tokenIds.length > 0 && (
                <div className="nft-token-picker__grid">
                    {tokenIds.map((id) => (
                        <button
                            key={id.toString()}
                            type="button"
                            className={`nft-token-picker__card ${selectedTokenId === id ? 'nft-token-picker__card--selected' : ''}`}
                            onClick={() => { onSelect(id); }}
                            disabled={disabled}
                        >
                            <span className="nft-token-picker__card-id">#{id.toString()}</span>
                            <span className="nft-token-picker__card-badge">OP-721</span>
                        </button>
                    ))}
                </div>
            )}

            {!loading && hasFetched && tokenIds.length === 0 && (
                <div className="nft-token-picker__empty">
                    No NFTs found in your wallet for this collection.
                </div>
            )}

            <div className="nft-token-picker__manual">
                <span className="nft-token-picker__manual-label">Or enter Token ID manually:</span>
                <div className="nft-token-picker__manual-row">
                    <input
                        className="form-input nft-token-picker__manual-input"
                        type="text"
                        placeholder="e.g. 42"
                        value={manualId}
                        onChange={(e) => { setManualId(e.target.value); }}
                        disabled={disabled}
                        autoComplete="off"
                    />
                    <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={handleManualSubmit}
                        disabled={disabled || manualId.trim().length === 0}
                    >
                        Select
                    </button>
                </div>
            </div>

            {selectedTokenId !== null && (
                <div className="nft-token-picker__selected">
                    Selected: <strong>#{selectedTokenId.toString()}</strong>
                </div>
            )}
        </div>
    );
}
