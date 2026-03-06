export function LaunchpadPage(): React.JSX.Element {
    return (
        <main>
            <section className="hero launchpad-hero" id="launchpad-home">
                <div className="hero__content">
                    <div className="hero__badge launchpad-badge">Bitcoin L1 &bull; OPNet &bull; Auto-Compound Vault</div>
                    <h1 className="hero__headline">
                        Monkey<br />
                        <span className="hero__headline-accent launchpad-accent">Vault</span>
                    </h1>
                    <p className="hero__sub">
                        Stake MOTO or PILL. Auto-compound rewards. Earn while you sleep.<br />
                        Coming soon.
                    </p>
                </div>
            </section>

            <section className="otc-section" style={{ minHeight: '40vh' }}>
                <div className="section-header">
                    <div className="section-tag launchpad-tag">Vault</div>
                    <h2 className="section-title">
                        Under <span className="text-accent launchpad-accent">Construction</span>
                    </h2>
                    <p className="section-sub">
                        The Monkey Vault is being built. Check back soon.
                    </p>
                </div>
                <div className="offers-empty">
                    <span className="offers-empty__icon">&#128640;</span>
                    <p className="offers-empty__text">Monkey Vault coming soon.</p>
                    <p className="offers-empty__sub">Stake, auto-compound, and earn rewards on Bitcoin L1 with OPNet.</p>
                </div>
            </section>
        </main>
    );
}
