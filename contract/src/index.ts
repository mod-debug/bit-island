import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { OTCEscrow } from './OTCEscrow';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

// Factory function — REQUIRED: must return a NEW instance via arrow function
Blockchain.contract = (): OTCEscrow => {
    return new OTCEscrow();
};

// Runtime exports — REQUIRED
export * from '@btc-vision/btc-runtime/runtime/exports';

// Abort handler — REQUIRED
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
