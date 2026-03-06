import { useEffect, useRef } from 'react';

interface BananaCoin {
    x: number;
    y: number;
    size: number;
    speed: number;
    opacity: number;
    rotation: number;
    rotationSpeed: number;
}

function BananaCanvas(): React.JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas === null) return;
        const ctx = canvas.getContext('2d');
        if (ctx === null) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const coins: BananaCoin[] = Array.from({ length: 18 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 16 + 8,
            speed: Math.random() * 1.0 + 0.3,
            opacity: Math.random() * 0.4 + 0.15,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.03,
        }));

        let animId: number;

        function draw(): void {
            if (ctx === null || canvas === null) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const c of coins) {
                ctx.save();
                ctx.globalAlpha = c.opacity;
                ctx.translate(c.x, c.y);
                ctx.rotate(c.rotation);
                const grad = ctx.createRadialGradient(-c.size * 0.3, -c.size * 0.3, 1, 0, 0, c.size);
                grad.addColorStop(0, '#fff8b8');
                grad.addColorStop(0.5, '#ffe135');
                grad.addColorStop(1, '#d4a017');
                ctx.beginPath();
                ctx.arc(0, 0, c.size, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.75)';
                ctx.font = `bold ${c.size * 1.1}px Poppins`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('\uD83C\uDF4C', 0, 1);
                ctx.restore();
                c.y += c.speed;
                c.rotation += c.rotationSpeed;
                c.x += Math.sin(c.y * 0.008) * 0.4;
                if (c.y > canvas.height + c.size) {
                    c.y = -c.size * 2;
                    c.x = Math.random() * canvas.width;
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

export function VestingHero(): React.JSX.Element {
    return (
        <section className="hero vault-hero" id="vault-home">
            <BananaCanvas />
            <div className="hero__content">
                <div className="hero__badge">Bitcoin L1 &bull; OPNet &bull; Token Vesting</div>
                <div className="vault-banana-wrap" aria-hidden="true">
                    <svg className="vault-banana-icon" viewBox="0 0 120 120" width="200" height="200">
                        <defs>
                            <linearGradient id="banana-body" x1="10%" y1="0%" x2="90%" y2="100%">
                                <stop offset="0%" stopColor="#fff176" />
                                <stop offset="30%" stopColor="#ffe135" />
                                <stop offset="70%" stopColor="#ffd000" />
                                <stop offset="100%" stopColor="#d4a017" />
                            </linearGradient>
                            <linearGradient id="banana-shadow" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#c89600" />
                                <stop offset="100%" stopColor="#8B6508" />
                            </linearGradient>
                            <radialGradient id="banana-glow" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor="rgba(255,225,53,0.3)" />
                                <stop offset="100%" stopColor="rgba(255,225,53,0)" />
                            </radialGradient>
                        </defs>
                        <circle cx="60" cy="60" r="55" fill="url(#banana-glow)" />
                        <path d="M90 25c-3-6-10-9-18-7-10 3-22 14-30 28-7 11-11 24-9 32 1 4 5 7 9 5 5-2 8-8 11-15 4-8 10-18 19-26 10-8 18-10 20-13 2-2 1-4-2-4z" fill="url(#banana-body)" stroke="url(#banana-shadow)" strokeWidth="1.5" strokeLinejoin="round"/>
                        <path d="M90 25c-1.5-3-4.5-5-8-5" fill="none" stroke="#6B4E00" strokeWidth="3.5" strokeLinecap="round"/>
                        <path d="M32 46c-1.5 3-3 6-4 9" fill="none" stroke="#8B6508" strokeWidth="3" strokeLinecap="round"/>
                        <path d="M42 35c6-5 14-10 22-13" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M48 42c5-4 11-8 17-10" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                </div>
                <h1 className="hero__headline">
                    <span className="hero__headline-accent vault-accent">Vesting Dashboard</span>
                </h1>
                <p className="hero__sub">
                    Your tokens ripen over time. Lock now, harvest later.<br />
                    Linear vesting with cliff support, revocable schedules, quantum-resistant security.
                </p>
                <div className="hero__cta-group">
                    <a href="#vest-create" className="btn btn--banana-flash btn--lg">
                        Create Schedule
                    </a>
                    <a href="#vest-browse" className="btn btn--primary btn--lg">
                        My Vesting
                    </a>
                </div>
                <div className="hero__pills">
                    <span className="hero__pill">Block-based vesting</span>
                    <span className="hero__pill">Revocable option</span>
                    <span className="hero__pill">Quantum-resistant</span>
                </div>
            </div>
            <div className="hero__scroll-hint" aria-hidden="true">
                <span className="hero__scroll-arrow" />
            </div>
        </section>
    );
}
