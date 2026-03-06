/**
 * Utility functions for converting between human-readable token amounts
 * and raw on-chain values (scaled by 10^decimals).
 *
 * OP-20 tokens typically use 18 decimals, meaning:
 *   1 token = 1_000_000_000_000_000_000n (1e18) base units
 */

/** Default decimals for OP-20 tokens */
export const DEFAULT_DECIMALS = 18;

/**
 * Parse a human-readable amount string into a raw bigint value.
 *
 * @param input - User input (e.g. "500", "1000.5", "0.001")
 * @param decimals - Token decimals (typically 18)
 * @returns The raw bigint amount scaled by 10^decimals
 * @throws If the input is not a valid number
 *
 * @example
 * parseTokenAmount("500", 18)   // → 500000000000000000000n
 * parseTokenAmount("0.5", 18)   // → 500000000000000000n
 * parseTokenAmount("1000.25", 8) // → 100025000000n
 */
export function parseTokenAmount(input: string, decimals: number): bigint {
    const trimmed = input.trim();
    if (trimmed === '' || trimmed === '.') {
        throw new Error('Amount cannot be empty');
    }

    // Validate: only digits, optional single dot, optional leading minus (reject negative later)
    if (!/^-?\d*\.?\d*$/.test(trimmed)) {
        throw new Error('Amount must be a valid number');
    }

    if (trimmed.startsWith('-')) {
        throw new Error('Amount must be positive');
    }

    const parts = trimmed.split('.');
    const intPart = parts[0] ?? '0';
    let fracPart = parts.length > 1 ? (parts[1] ?? '') : '';

    // Truncate fractional digits beyond token precision (no rounding — floor)
    if (fracPart.length > decimals) {
        fracPart = fracPart.slice(0, decimals);
    }

    // Pad fractional part to `decimals` length
    fracPart = fracPart.padEnd(decimals, '0');

    const raw = BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(fracPart);
    if (raw <= 0n) {
        throw new Error('Amount must be greater than 0');
    }

    return raw;
}

/**
 * Format a raw bigint amount into a human-readable string.
 *
 * @param amount - Raw on-chain amount (e.g. 500000000000000000000n)
 * @param decimals - Token decimals (typically 18)
 * @returns Human-readable string (e.g. "500", "1,000.5")
 *
 * @example
 * formatTokenAmount(500000000000000000000n, 18) // → "500"
 * formatTokenAmount(500500000000000000000n, 18) // → "500.5"
 * formatTokenAmount(1000000000000000000000n, 18) // → "1,000"
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
    const divisor = 10n ** BigInt(decimals);
    const intPart = amount / divisor;
    const fracPart = amount % divisor;

    // Format integer part with thousands separator
    const intStr = intPart.toLocaleString();

    if (fracPart === 0n) {
        return intStr;
    }

    // Pad fractional part to full precision, then keep only 2 decimals
    const fracStr = fracPart.toString().padStart(decimals, '0').slice(0, 2);

    // Hide fractional part if it's "00"
    if (fracStr === '00') {
        return intStr;
    }

    // Remove single trailing zero (e.g. "50" → "5")
    const trimmed = fracStr.replace(/0$/, '');

    return `${intStr}.${trimmed}`;
}
