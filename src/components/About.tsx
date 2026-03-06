const FEATURES = [
    {
        icon: '⚓',
        title: 'Trustless Escrow',
        desc: 'The smart contract holds offered tokens. No human intermediary, no custody risk. The Pirate\'s Code is law.',
    },
    {
        icon: '₿',
        title: 'Bitcoin L1 Native',
        desc: 'Deployed directly on Bitcoin via OPNet. No bridges, no wrapping, no sidechains. Pure BTC security.',
    },
    {
        icon: '🛡️',
        title: 'Quantum Resistant',
        desc: 'OPNet uses ML-DSA signatures (FIPS 204). Your trades are secured against both classical and quantum attacks.',
    },
    {
        icon: '🔁',
        title: 'Atomic Swap',
        desc: 'Either both sides of the deal execute, or neither does. Partial fills are impossible by design.',
    },
] as const;

export function About(): React.JSX.Element {
    return (
        <section className="about" id="about" aria-labelledby="about-title">
            <div className="section-header">
                <div className="section-tag">The Pirate's Code</div>
                <h2 className="section-title" id="about-title">
                    Why Bit-Island<br />
                    <span className="text-accent">OTC Escrow</span>
                </h2>
                <p className="section-sub">
                    The first peer-to-peer OTC escrow on Bitcoin L1.
                    Trade any OP-20 tokens directly — no order books, no AMM slippage, just deals.
                </p>
            </div>

            <div className="features-grid">
                {FEATURES.map((f) => (
                    <div key={f.title} className="feature-card">
                        <div className="feature-card__icon" aria-hidden="true">{f.icon}</div>
                        <h3 className="feature-card__title">{f.title}</h3>
                        <p className="feature-card__desc">{f.desc}</p>
                    </div>
                ))}
            </div>

            <div className="how-it-works">
                <h3 className="how-it-works__title">How It Works</h3>
                <div className="steps">
                    {[
                        { n: '1', label: 'Connect Wallet', desc: 'Connect your OP_WALLET to Bit-Island' },
                        { n: '2', label: 'Post Your Deal', desc: 'Specify token A amount and what you want in return (token B amount)' },
                        { n: '3', label: 'Approve & Lock', desc: '2 transactions: approve the escrow, then lock your tokens on-chain' },
                        { n: '4', label: 'Counterparty Accepts', desc: 'They approve their tokens, call accept — swap executes atomically' },
                    ].map((s, i) => (
                        <div key={s.n} className="step" style={{ '--step-delay': `${i * 100}ms` } as React.CSSProperties}>
                            <div className="step__num">{s.n}</div>
                            <div className="step__content">
                                <span className="step__label">{s.label}</span>
                                <span className="step__desc">{s.desc}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
