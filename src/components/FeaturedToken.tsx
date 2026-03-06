import { BTCMONKEY_TOKEN } from '../services/TokenRegistryService.js';

function formatSupply(supply: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals);
    const whole = supply / divisor;
    return whole.toLocaleString();
}

export function FeaturedToken(): React.JSX.Element {
    const supply = formatSupply(BTCMONKEY_TOKEN.maxSupply, BTCMONKEY_TOKEN.decimals);

    return (
        <section className="featured-token" id="monk" aria-labelledby="monk-title">
            <div className="section-header">
                <div className="section-tag">Island Token</div>
                <h2 className="section-title" id="monk-title">
                    Introducing <span className="text-accent">$MONK</span>
                </h2>
                <p className="section-sub">
                    The first token ever launched on Monkey Island — and on Bitcoin L1.
                    The heartbeat of the island economy.
                </p>
            </div>

            <div className="monk-card">
                <div className="monk-card__logo" aria-hidden="true">
                    <div className="monk-logo-ring">
                        <span className="monk-logo-emoji">&#128018;</span>
                    </div>
                </div>

                <div className="monk-card__info">
                    <div className="monk-name-row">
                        <span className="monk-name">BTC Monkey</span>
                        <span className="monk-symbol">$MONK</span>
                        <span className="monk-badge">OFFICIAL</span>
                    </div>

                    <p className="monk-desc">{BTCMONKEY_TOKEN.description}</p>

                    <div className="monk-stats">
                        <div className="monk-stat">
                            <span className="monk-stat__label">Total Supply</span>
                            <span className="monk-stat__value text-gold">{supply}</span>
                        </div>
                        <div className="monk-stat">
                            <span className="monk-stat__label">Decimals</span>
                            <span className="monk-stat__value">{BTCMONKEY_TOKEN.decimals}</span>
                        </div>
                        <div className="monk-stat">
                            <span className="monk-stat__label">Network</span>
                            <span className="monk-stat__value">Bitcoin L1</span>
                        </div>
                        <div className="monk-stat">
                            <span className="monk-stat__label">Standard</span>
                            <span className="monk-stat__value text-accent">OP20</span>
                        </div>
                    </div>

                    <div className="monk-card__actions">
                        <a href="#launch" className="btn btn--primary">
                            Launch Your Own Token
                        </a>
                        <span className="monk-card__powered">
                            Built on <span className="text-accent">OPNet</span> — Bitcoin L1
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
}
