import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { VestingVault } from './VestingVault';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

// Factory function — REQUIRED: must return a NEW instance via arrow function
Blockchain.contract = (): VestingVault => {
    return new VestingVault();
};

// Runtime exports — REQUIRED
export * from '@btc-vision/btc-runtime/runtime/exports';

// Abort handler — REQUIRED
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
