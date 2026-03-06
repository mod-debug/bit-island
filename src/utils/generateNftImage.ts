/**
 * Deterministic generative pixel art for NFTs.
 * Produces a unique symmetric avatar from a tokenId seed.
 * Inspired by the Bitcoin Nation NFT Platform approach.
 */

/** Simple seeded PRNG (mulberry32). */
function seededRng(seed: number): () => number {
    let s = seed | 0;
    return (): number => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Convert HSL to RGB hex string. */
function hslToHex(h: number, s: number, l: number): string {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }

    const toHex = (v: number): string => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generate a deterministic pixel art avatar for an NFT.
 * Returns a data:image/png base64 string.
 *
 * @param tokenId - The NFT token ID (used as seed)
 * @param collectionSeed - Optional extra seed from collection address
 * @param size - Canvas size in pixels (default 100)
 */
export function generateNftImage(
    tokenId: bigint,
    collectionSeed = 0,
    size = 100,
): string {
    const seed = (Number(tokenId & 0xFFFFFFFFn) + collectionSeed) | 0;
    const rng = seededRng(seed);

    // Grid dimensions (half-width mirrored for symmetry)
    const rows = 10;
    const halfCols = 5;
    const cellSize = size / rows;

    // Deterministic colors
    const hue = (seed * 137 + collectionSeed * 53) % 360;
    const fg = hslToHex(hue, 0.7, 0.55);
    const bg = hslToHex((hue + 180) % 360, 0.15, 0.08);
    const accent = hslToHex((hue + 60) % 360, 0.6, 0.4);

    // Generate symmetric grid
    const grid: number[][] = [];
    for (let r = 0; r < rows; r++) {
        const half: number[] = [];
        for (let c = 0; c < halfCols; c++) {
            half.push(rng() > 0.5 ? 1 : (rng() > 0.7 ? 2 : 0));
        }
        // Mirror horizontally
        grid.push([...half, ...half.slice().reverse()]);
    }

    // Render to canvas
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return '';

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // Draw cells
    for (let r = 0; r < rows; r++) {
        const row = grid[r];
        if (row === undefined) continue;
        for (let c = 0; c < rows; c++) {
            const cell = row[c];
            if (cell === 1) {
                ctx.fillStyle = fg;
                ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
            } else if (cell === 2) {
                ctx.fillStyle = accent;
                ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
            }
        }
    }

    // Subtle border glow
    ctx.strokeStyle = fg + '44';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);

    return canvas.toDataURL('image/png');
}

/**
 * Hash a collection address string to a numeric seed.
 */
export function collectionToSeed(address: string): number {
    let h = 0;
    for (let i = 0; i < address.length; i++) {
        h = ((h << 5) - h + address.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}
