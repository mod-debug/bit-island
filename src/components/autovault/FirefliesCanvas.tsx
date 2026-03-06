import { useEffect, useRef } from 'react';

/** Vivid colors from the Bitcoin globe artwork */
const COLORS = [
    '#ff3030',   // red
    '#ff6a00',   // orange
    '#ffcc00',   // yellow
    '#00dd55',   // green
    '#00aaff',   // blue
    '#6633ff',   // violet
    '#ff20aa',   // pink
    '#00e5cc',   // cyan
    '#ff8800',   // amber
    '#aa44ff',   // purple
    '#33ddff',   // light blue
    '#ff4477',   // hot pink
];

interface Firefly {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    alpha: number;
    alphaDir: number;
    pulse: number;
}

interface BitcoinCoin {
    x: number;
    y: number;
    size: number;
    speed: number;
    opacity: number;
    rotation: number;
    rotationSpeed: number;
}

function createFirefly(w: number, h: number): Firefly {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#ffcc00';
    return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        size: Math.random() * 4 + 2,
        color,
        alpha: Math.random() * 0.7 + 0.3,
        alphaDir: (Math.random() - 0.5) * 0.015,
        pulse: Math.random() * Math.PI * 2,
    };
}

function createCoin(w: number, h: number): BitcoinCoin {
    return {
        x: Math.random() * w,
        y: Math.random() * h - h,
        size: Math.random() * 18 + 8,
        speed: Math.random() * 1.2 + 0.4,
        opacity: Math.random() * 0.5 + 0.15,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.04,
    };
}

interface FirefliesCanvasProps {
    /** Enable falling Bitcoin coins rain */
    bitcoinRain?: boolean;
}

/**
 * Full-viewport canvas with colorful firefly particles
 * and optional Bitcoin coin rain.
 */
export function FirefliesCanvas({ bitcoinRain = false }: FirefliesCanvasProps): React.JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas === null) return;
        const ctx = canvas.getContext('2d');
        if (ctx === null) return;

        const resize = (): void => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();

        const FIREFLY_COUNT = 17;
        const flies: Firefly[] = Array.from({ length: FIREFLY_COUNT }, () =>
            createFirefly(canvas.width, canvas.height),
        );

        const COIN_COUNT = bitcoinRain ? 15 : 0;
        const coins: BitcoinCoin[] = Array.from({ length: COIN_COUNT }, () =>
            createCoin(canvas.width, canvas.height),
        );

        let animId: number;

        function draw(): void {
            if (ctx === null || canvas === null) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw Bitcoin coins (behind fireflies)
            for (const coin of coins) {
                ctx.save();
                ctx.globalAlpha = coin.opacity;
                ctx.translate(coin.x, coin.y);
                ctx.rotate(coin.rotation);

                const grad = ctx.createRadialGradient(
                    -coin.size * 0.3, -coin.size * 0.3, 1,
                    0, 0, coin.size,
                );
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
                ctx.fillText('\u20BF', 0, 1);

                ctx.restore();

                coin.y += coin.speed;
                coin.rotation += coin.rotationSpeed;
                coin.x += Math.sin(coin.y * 0.01) * 0.5;

                if (coin.y > canvas.height + coin.size) {
                    coin.y = -coin.size * 2;
                    coin.x = Math.random() * canvas.width;
                }
            }

            // Draw fireflies
            for (const f of flies) {
                f.pulse += 0.02;
                const glow = Math.sin(f.pulse) * 0.3 + 0.7;
                const finalAlpha = f.alpha * glow;

                // Outer glow
                const gradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 6);
                gradient.addColorStop(0, f.color + hexAlpha(finalAlpha * 0.6));
                gradient.addColorStop(0.4, f.color + hexAlpha(finalAlpha * 0.2));
                gradient.addColorStop(1, f.color + '00');
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.size * 6, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();

                // Core bright dot
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
                ctx.fillStyle = f.color + hexAlpha(finalAlpha);
                ctx.fill();

                // Move
                f.x += f.vx + Math.sin(f.pulse * 0.7) * 0.3;
                f.y += f.vy + Math.cos(f.pulse * 0.5) * 0.3;

                // Wrap around edges
                if (f.x < -20) f.x = canvas.width + 20;
                if (f.x > canvas.width + 20) f.x = -20;
                if (f.y < -20) f.y = canvas.height + 20;
                if (f.y > canvas.height + 20) f.y = -20;

                // Slowly drift direction
                f.vx += (Math.random() - 0.5) * 0.02;
                f.vy += (Math.random() - 0.5) * 0.02;
                f.vx = Math.max(-0.8, Math.min(0.8, f.vx));
                f.vy = Math.max(-0.8, Math.min(0.8, f.vy));
            }

            animId = requestAnimationFrame(draw);
        }

        draw();
        window.addEventListener('resize', resize);
        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
        };
    }, [bitcoinRain]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: -1,
                pointerEvents: 'none',
            }}
        />
    );
}

/** Convert 0-1 alpha to 2-char hex */
function hexAlpha(a: number): string {
    const clamped = Math.max(0, Math.min(1, a));
    const hex = Math.round(clamped * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
}
