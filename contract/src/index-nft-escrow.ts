import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { NFTEscrow } from './NFTEscrow';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

// Factory function — REQUIRED: must return a NEW instance via arrow function
Blockchain.contract = (): NFTEscrow => {
    return new NFTEscrow();
};

// Runtime exports — REQUIRED
export * from '@btc-vision/btc-runtime/runtime/exports';

// Abort handler — REQUIRED
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
