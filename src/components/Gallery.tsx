import { useMint } from '../hooks/useMint.js';

// Placeholder monkey cards for the gallery
const MONKEY_TRAITS = [
    { name: 'Captain Satoshi', rarity: 'Legendary', trait: 'Pirate Hat', bg: '#1a0a00' },
    { name: 'Jungle King', rarity: 'Epic', trait: 'Gold Chain', bg: '#0a1a00' },
    { name: 'Beach Bro', rarity: 'Rare', trait: 'Sunglasses', bg: '#001a1a' },
    { name: 'Banana Hoarder', rarity: 'Common', trait: 'Banana', bg: '#1a1a00' },
    { name: 'Island Pirate', rarity: 'Epic', trait: 'Eye Patch', bg: '#1a000a' },
    { name: 'BTC OG', rarity: 'Legendary', trait: 'Bitcoin Medal', bg: '#0a0010' },
    { name: 'Palm Surfer', rarity: 'Rare', trait: 'Hawaiian Shirt', bg: '#001a10' },
    { name: 'Moon Monkey', rarity: 'Rare', trait: 'Space Suit', bg: '#000a1a' },
] as const;

const RARITY_COLORS: Record<string, string> = {
    Legendary: '#ffd700',
    Epic: '#bf00ff',
    Rare: '#0070dd',
    Common: '#aaa',
};

function MonkeyCard({ name, rarity, trait, bg, index }: {
    name: string;
    rarity: string;
    trait: string;
    bg: string;
    index: number;
}): React.JSX.Element {
    const rarityColor = RARITY_COLORS[rarity] ?? '#aaa';

    return (
        <div
            className="monkey-card"
            style={{ '--card-bg': bg, '--card-delay': `${index * 80}ms` } as React.CSSProperties}
        >
            <div className="monkey-card__img-wrap" style={{ background: bg }}>
                <div className="monkey-card__id">#{(index + 1).toString().padStart(4, '0')}</div>
                <div className="monkey-card__placeholder" aria-hidden="true">
                    <span className="monkey-card__emoji">&#128018;</span>
                </div>
                <div
                    className="monkey-card__rarity-badge"
                    style={{ color: rarityColor, borderColor: rarityColor }}
                >
                    {rarity}
                </div>
            </div>
            <div className="monkey-card__body">
                <span className="monkey-card__name">{name}</span>
                <span className="monkey-card__trait">{trait}</span>
            </div>
        </div>
    );
}

export function Gallery(): React.JSX.Element {
    const { stats, loading } = useMint();
    const minted = stats !== null ? Number(stats.totalMinted) : 0;

    return (
        <section className="gallery" id="collection" aria-labelledby="gallery-title">
            <div className="section-header">
                <div className="section-tag">Collection Preview</div>
                <h2 className="section-title" id="gallery-title">
                    Meet the <span className="text-accent">Monkeys</span>
                </h2>
                <p className="section-sub">
                    4,200 unique hand-crafted Monkeys. Each one different. Each one yours —
                    permanently stored on Bitcoin L1.
                </p>
            </div>

            {loading ? (
                <div className="gallery__loading" aria-label="Loading collection">
                    <span className="spinner spinner--lg" />
                </div>
            ) : (
                <>
                    <div className="gallery__grid">
                        {MONKEY_TRAITS.map((monkey, i) => (
                            <MonkeyCard
                                key={monkey.name}
                                name={monkey.name}
                                rarity={monkey.rarity}
                                trait={monkey.trait}
                                bg={monkey.bg}
                                index={i}
                            />
                        ))}
                    </div>

                    <div className="gallery__footer">
                        <div className="gallery__minted-info">
                            <span className="gallery__minted-count">
                                {minted.toLocaleString()}
                            </span>
                            <span className="gallery__minted-label">
                                Monkeys minted so far
                            </span>
                        </div>
                        <a href="#mint" className="btn btn--primary">
                            Mint Yours Now
                        </a>
                    </div>
                </>
            )}
        </section>
    );
}
