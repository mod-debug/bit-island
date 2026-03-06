import { useEffect, useRef } from 'react';

interface Coin {
    x: number;
    y: number;
    size: number;
    speed: number;
    opacity: number;
    rotation: number;
    rotationSpeed: number;
}

function CoinsCanvas(): React.JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas === null) return;
        const ctx = canvas.getContext('2d');
        if (ctx === null) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const coins: Coin[] = Array.from({ length: 20 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 18 + 8,
            speed: Math.random() * 1.2 + 0.4,
            opacity: Math.random() * 0.5 + 0.15,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.04,
        }));

        let animId: number;

        function draw(): void {
            if (ctx === null || canvas === null) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const coin of coins) {
                ctx.save();
                ctx.globalAlpha = coin.opacity;
                ctx.translate(coin.x, coin.y);
                ctx.rotate(coin.rotation);
                const grad = ctx.createRadialGradient(-coin.size * 0.3, -coin.size * 0.3, 1, 0, 0, coin.size);
                grad.addColorStop(0, '#ffe066');
                grad.addColorStop(0.6, '#f7931a');
                grad.addColorStop(1, '#c45e00');
                ctx.beginPath();
                ctx.arc(0, 0, coin.size, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.font = `bold ${coin.size}px Poppins`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('₿', 0, 1);
                ctx.restore();
                coin.y += coin.speed;
                coin.rotation += coin.rotationSpeed;
                coin.x += Math.sin(coin.y * 0.01) * 0.5;
                if (coin.y > canvas.height + coin.size) {
                    coin.y = -coin.size * 2;
                    coin.x = Math.random() * canvas.width;
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

    return <canvas ref={canvasRef} className="coins-canvas" aria-hidden="true" />;
}

export function Hero(): React.JSX.Element {
    return (
        <section className="hero" id="home">
            <CoinsCanvas />
            <div className="hero__content">
                <div className="hero__badge">Bitcoin L1 &bull; OPNet &bull; Trustless OTC</div>
                <div className="trade-icon-wrap" aria-hidden="true">
                    <svg className="trade-icon" viewBox="0 0 120 120" width="200" height="200">
                        <defs>
                            <linearGradient id="coin-face" x1="10%" y1="0%" x2="90%" y2="100%">
                                <stop offset="0%" stopColor="#ffe066" />
                                <stop offset="40%" stopColor="#f7931a" />
                                <stop offset="100%" stopColor="#c45e00" />
                            </linearGradient>
                            <linearGradient id="coin-rim" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#d4820a" />
                                <stop offset="100%" stopColor="#8a4e00" />
                            </linearGradient>
                            <radialGradient id="coin-glow" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor="rgba(247,147,26,0.35)" />
                                <stop offset="100%" stopColor="rgba(247,147,26,0)" />
                            </radialGradient>
                        </defs>
                        <circle cx="60" cy="60" r="56" fill="url(#coin-glow)" />
                        <ellipse cx="60" cy="62" rx="38" ry="38" fill="url(#coin-rim)" />
                        <ellipse cx="60" cy="58" rx="38" ry="38" fill="url(#coin-face)" />
                        <ellipse cx="60" cy="58" rx="32" ry="32" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
                        <text x="60" y="68" textAnchor="middle" fontSize="36" fontWeight="bold" fill="rgba(255,255,255,0.85)" fontFamily="Poppins, sans-serif">&#8383;</text>
                        <path d="M28 42 L38 32" fill="none" stroke="#ffe066" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
                        <path d="M92 42 L82 32" fill="none" stroke="#ffe066" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
                        <path d="M24 58 L14 58" fill="none" stroke="#f7931a" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                        <path d="M96 58 L106 58" fill="none" stroke="#f7931a" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                        <path d="M30 76 L20 82" fill="none" stroke="#f7931a" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
                        <path d="M90 76 L100 82" fill="none" stroke="#f7931a" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
                    </svg>
                </div>
                <h1 className="hero__headline">
                    <span className="hero__headline-accent">Bit OTC Escrow</span>
                </h1>
                <p className="hero__sub">
                    The first trustless P2P token swap on Bitcoin L1.<br />
                    Post a deal. Lock your tokens. Let the Pirate's Code do the rest.
                </p>
                <div className="hero__cta-group">
                    <a href="#create" className="btn btn--gold-flash btn--lg">
                        Post a Deal
                    </a>
                    <a href="#browse" className="btn btn--primary btn--lg">
                        Marketplace
                    </a>
                </div>
                <div className="hero__pills">
                    <span className="hero__pill">No intermediary</span>
                    <span className="hero__pill">No custody risk</span>
                    <span className="hero__pill">Quantum-resistant</span>
                </div>
            </div>
            <div className="hero__scroll-hint" aria-hidden="true">
                <span className="hero__scroll-arrow" />
            </div>
        </section>
    );
}
