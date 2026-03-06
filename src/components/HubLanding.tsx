import { Link } from 'react-router-dom';
import { useEffect, useRef } from 'react';

/* ── Floating particles background ── */
interface Particle {
    x: number;
    y: number;
    size: number;
    speed: number;
    opacity: number;
    drift: number;
}

function ParticlesCanvas(): React.JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas === null) return;
        const ctx = canvas.getContext('2d');
        if (ctx === null) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles: Particle[] = Array.from({ length: 40 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 3 + 1,
            speed: Math.random() * 0.5 + 0.1,
            opacity: Math.random() * 0.4 + 0.1,
            drift: (Math.random() - 0.5) * 0.3,
        }));

        let animId: number;

        function draw(): void {
            if (ctx === null || canvas === null) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const p of particles) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(247, 147, 26, ${p.opacity.toString()})`;
                ctx.fill();
                p.y -= p.speed;
                p.x += p.drift;
                if (p.y < -10) {
                    p.y = canvas.height + 10;
                    p.x = Math.random() * canvas.width;
                }
            }
            animId = requestAnimationFrame(draw);
        }

        draw();

        const onResize = (): void => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', onResize);
        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', onResize);
        };
    }, []);

    return <canvas ref={canvasRef} className="hub-particles" aria-hidden="true" />;
}

/* ── Hub card data ── */
interface HubCard {
    readonly title: string;
    readonly subtitle: string;
    readonly description: string;
    readonly icon: string;
    readonly route: string;
    readonly accent: string;
    readonly status: 'live' | 'coming';
    readonly image?: string;
}

const HUB_CARDS: readonly HubCard[] = [
    {
        title: 'Bit OTC Escrow',
        subtitle: 'Trustless P2P Swaps',
        description: 'Trustless P2P token swaps on Bitcoin L1. Post a deal, lock your tokens, let the code do the rest.',
        icon: '\u2694\uFE0F',
        route: '/otc',
        accent: 'var(--accent-primary)',
        status: 'live',
        image: '/images/hooded-figure.jpg',
    },
    {
        title: 'Revenue Vault',
        subtitle: 'Staking & Auto-Compound',
        description: 'Stake MOTO or PILL. Rewards auto-compound every block. Earn while you sleep.',
        icon: '\uD83C\uDFE6',
        route: '/vault',
        accent: 'var(--vault-cyan, #00d4aa)',
        status: 'live',
        image: '/images/monkey-headphones.jpg',
    },
    {
        title: 'Vesting Dashboard',
        subtitle: 'Token Vesting Schedules',
        description: 'Lock tokens with cliff periods, linear or stepped release. Perfect for teams and investors.',
        icon: '\uD83D\uDD12',
        route: '/vesting',
        accent: 'var(--vest-blue)',
        status: 'live',
        image: '/images/cyber-cat.jpg',
    },
];

export function HubLanding(): React.JSX.Element {
    return (
        <main className="hub">
            <ParticlesCanvas />

            <section className="hub__hero">
                <img
                    src="/images/monkey-rapper.avif"
                    alt=""
                    className="hub__hero-mascot"
                />
                <div className="hub__badge">Bitcoin L1 &bull; OPNet &bull; DeFi Hub</div>
                <h1 className="hub__title">
                    <span className="btc-b">&#8383;</span><span className="hub__title-accent">it-</span>{' '}
                    <span className="hub__title-accent">Island</span>
                </h1>
                <p className="hub__subtitle">
                    Your DeFi oasis on Bitcoin Layer 1.<br />
                    Trade, stake, vest &mdash; all trustless, all on-chain.
                </p>
            </section>

            <section className="hub__grid">
                {HUB_CARDS.map((card) => (
                    <Link
                        key={card.route}
                        to={card.route}
                        className="hub-card"
                        style={{ '--card-accent': card.accent } as React.CSSProperties}
                    >
                        {card.image !== undefined && (
                            <div className="hub-card__image-wrap">
                                <img src={card.image} alt="" className="hub-card__image" />
                                <div className="hub-card__image-overlay" />
                            </div>
                        )}
                        <div className="hub-card__body">
                            <div className="hub-card__status">
                                {card.status === 'live' ? (
                                    <span className="hub-card__status-badge hub-card__status-badge--live">LIVE</span>
                                ) : (
                                    <span className="hub-card__status-badge hub-card__status-badge--coming">SOON</span>
                                )}
                            </div>
                            <span className="hub-card__icon">{card.icon}</span>
                            <h2 className="hub-card__title">{card.title}</h2>
                            <p className="hub-card__subtitle">{card.subtitle}</p>
                            <p className="hub-card__desc">{card.description}</p>
                            <span className="hub-card__cta">
                                {card.status === 'live' ? 'Enter' : 'Preview'} &rarr;
                            </span>
                        </div>
                    </Link>
                ))}
            </section>

            <section className="hub__footer-info">
                <div className="hub__pills">
                    <span className="hero__pill">No intermediary</span>
                    <span className="hero__pill">No custody risk</span>
                    <span className="hero__pill">Quantum-resistant</span>
                    <span className="hero__pill">Bitcoin L1 native</span>
                </div>
            </section>
        </main>
    );
}
