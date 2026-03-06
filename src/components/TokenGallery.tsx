import { useState } from 'react';
import { getAllTokens, BTCMONKEY_TOKEN } from '../services/TokenRegistryService.js';
import type { LaunchedToken } from '../types/index.js';

function formatSupply(supply: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals);
    const whole = supply / divisor;
    if (whole >= 1_000_000_000n) return `${(whole / 1_000_000_000n).toString()}B`;
    if (whole >= 1_000_000n) return `${(whole / 1_000_000n).toString()}M`;
    if (whole >= 1_000n) return `${(whole / 1_000n).toString()}K`;
    return whole.toLocaleString();
}

function formatAddress(addr: string): string {
    if (addr === 'DEPLOY_ADDRESS_HERE') return 'Coming soon';
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function TokenCard({ token, featured }: { token: LaunchedToken; featured?: boolean }): React.JSX.Element {
    return (
        <div className={`token-card${featured === true ? ' token-card--featured' : ''}`}>
            {featured === true && (
                <div className="token-card__crown" aria-label="Official token">
                    &#x1F451; Official
                </div>
            )}
            <div className="token-card__header">
                <div className="token-card__icon" aria-hidden="true">
                    {token.symbol.slice(0, 2)}
                </div>
                <div className="token-card__title">
                    <span className="token-card__name">{token.name}</span>
                    <span className="token-card__symbol text-accent">${token.symbol}</span>
                </div>
            </div>
            <p className="token-card__desc">{token.description}</p>
            <div className="token-card__stats">
                <div className="token-card__stat">
                    <span className="token-card__stat-label">Supply</span>
                    <span className="token-card__stat-value text-gold">
                        {formatSupply(token.maxSupply, token.decimals)}
                    </span>
                </div>
                <div className="token-card__stat">
                    <span className="token-card__stat-label">Decimals</span>
                    <span className="token-card__stat-value">{token.decimals}</span>
                </div>
            </div>
            <div className="token-card__footer">
                <span className="token-card__address monospace">
                    {formatAddress(token.contractAddress)}
                </span>
                <span className="token-card__time">{timeAgo(token.createdAt)}</span>
            </div>
        </div>
    );
}

export function TokenGallery(): React.JSX.Element {
    const [tokens] = useState<LaunchedToken[]>(() => getAllTokens());

    return (
        <section className="token-gallery" id="tokens" aria-labelledby="gallery-title">
            <div className="section-header">
                <div className="section-tag">Island Tokens</div>
                <h2 className="section-title" id="gallery-title">
                    Tokens Born on <span className="text-accent">Monkey Island</span>
                </h2>
                <p className="section-sub">
                    Every token below lives permanently on Bitcoin L1.
                    Yours could be next.
                </p>
            </div>

            <div className="token-grid">
                <TokenCard token={BTCMONKEY_TOKEN} featured={true} />
                {tokens.map((t) => (
                    <TokenCard key={t.id} token={t} />
                ))}
                {tokens.length === 0 && (
                    <div className="token-grid__empty">
                        <span className="token-grid__empty-icon" aria-hidden="true">&#128018;</span>
                        <span>Be the first to launch a token on Monkey Island</span>
                        <a href="#launch" className="btn btn--primary btn--sm">Launch Now</a>
                    </div>
                )}
            </div>
        </section>
    );
}
