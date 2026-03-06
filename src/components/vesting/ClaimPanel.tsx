import { useState, useEffect } from 'react';
import type { VestingSchedule } from '../../types/index.js';
import { vestingService } from '../../services/VestingVaultService.js';
import { formatTokenAmount } from '../../utils/tokenAmount.js';

interface ClaimPanelProps {
    readonly myBeneficiary: VestingSchedule[];
    readonly onClaim: (s: VestingSchedule) => void;
    readonly onClaimAll?: (schedules: VestingSchedule[]) => void;
    readonly claiming: bigint | null;
    readonly claimingAll?: boolean;
    readonly recentlyClaimed: Set<string>;
}

interface TokenInfo {
    symbol: string;
    decimals: number;
}

export function ClaimPanel({ myBeneficiary, onClaim, onClaimAll, claiming, claimingAll, recentlyClaimed }: ClaimPanelProps): React.JSX.Element {
    const [tokenInfo, setTokenInfo] = useState<Map<string, TokenInfo>>(new Map());

    const claimable = myBeneficiary.filter((s) => s.claimableAmount > 0n && !s.revoked && !recentlyClaimed.has(s.id.toString()));

    useEffect(() => {
        const tokens = new Set(claimable.map((s) => s.token));
        for (const token of tokens) {
            if (!tokenInfo.has(token)) {
                void (async () => {
                    const [symbol, decimals] = await Promise.all([
                        vestingService.resolveTokenSymbol(token),
                        vestingService.resolveTokenDecimals(token),
                    ]);
                    setTokenInfo((prev) => {
                        const next = new Map(prev);
                        next.set(token, { symbol, decimals });
                        return next;
                    });
                })();
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claimable.length]);

    if (claimable.length === 0) return <></>;

    const isBusy = claiming !== null || (claimingAll === true);

    return (
        <section className="vest-claim-panel">
            <div className="vest-claim-panel__inner">
                <div className="vest-claim-panel__header">
                    <h3 className="vest-claim-panel__title">
                        &#127820; Tokens Ready to Harvest
                    </h3>
                    {claimable.length > 1 && onClaimAll !== undefined && (
                        <button
                            className={`btn btn--sm btn--claim-all ${claimingAll === true ? 'btn--claim-all--active' : ''}`}
                            onClick={() => onClaimAll(claimable)}
                            disabled={isBusy}
                        >
                            {claimingAll === true ? 'Setting up\u2026' : `Claim All (${claimable.length})`}
                        </button>
                    )}
                </div>
                <div className="vest-claim-list">
                    {claimable.map((s) => {
                        const info = tokenInfo.get(s.token);
                        const sym = info?.symbol ?? '…';
                        const dec = info?.decimals ?? 18;
                        const isClaiming = claiming === s.id;
                        const alreadyClaimed = recentlyClaimed.has(s.id.toString());
                        const isDisabled = isClaiming || alreadyClaimed;

                        return (
                            <div key={s.id.toString()} className="vest-claim-item">
                                <div className="vest-claim-item__info">
                                    <span className="vest-claim-item__id">#{s.id.toString()}</span>
                                    <span className="vest-claim-item__amount">
                                        {formatTokenAmount(s.claimableAmount, dec)} {sym}
                                    </span>
                                </div>
                                <button
                                    className={`btn btn--sm ${isDisabled ? 'btn--ghost' : 'btn--banana-flash'}`}
                                    onClick={() => onClaim(s)}
                                    disabled={isDisabled}
                                >
                                    {isClaiming ? 'Claiming…' : alreadyClaimed ? 'Claimed' : 'Claim'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
