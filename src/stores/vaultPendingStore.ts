import { useSyncExternalStore } from 'react';
import type { TxStep } from '../types/index.js';

/**
 * Module-level store for vault pending operations.
 * Uses useSyncExternalStore — immune to React state loss, re-renders, and component unmounts.
 * Same pattern as pendingFlowStore (used by vesting — proven reliable).
 */

const STORAGE_KEY = 'btcmonkeys-vault-ops-v2';
const OP_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Fund params persisted for resume */
export interface StoredFundParams {
    readonly tokenAddress: string;
    readonly amount: string;
    readonly sym: string;
    readonly dec: number;
    readonly formattedAmt: string;
}

/** A single vault pending operation */
export interface VaultPendingOp {
    readonly type: 'deposit' | 'withdraw' | 'compound' | 'fund';
    readonly steps: TxStep[];
    readonly startedAt: number;
    readonly walletAddress: string;
    readonly awaitingConfirm: boolean;
    readonly fundParams?: StoredFundParams;
}

/* ── Module-level state ────────────────────────────────────────────────── */

function loadFromStorage(): VaultPendingOp[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        const parsed = JSON.parse(raw) as VaultPendingOp[];
        const alive = parsed.filter((op) => Date.now() - op.startedAt < OP_TTL_MS);
        if (alive.length < parsed.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(alive));
        }
        return alive;
    } catch { return []; }
}

function saveToStorage(data: VaultPendingOp[]): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { /* quota exceeded — silently ignore */ }
}

let ops: VaultPendingOp[] = loadFromStorage();

const listeners = new Set<() => void>();

function notify(): void {
    for (const fn of listeners) fn();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function getSnapshot(): VaultPendingOp[] {
    return ops;
}

/* ── Public mutation API ───────────────────────────────────────────────── */

/** Add or replace a pending op (one per type) */
export function addVaultOp(op: VaultPendingOp): void {
    ops = [...ops.filter((o) => o.type !== op.type), op];
    saveToStorage(ops);
    notify();
}

/** Patch a specific step within a pending op */
export function patchVaultStep(type: string, index: number, patch: Partial<TxStep>): void {
    let changed = false;
    ops = ops.map((o) => {
        if (o.type !== type) return o;
        changed = true;
        const newSteps = o.steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
        return { ...o, steps: newSteps };
    });
    if (changed) { saveToStorage(ops); notify(); }
}

/** Replace all steps for a pending op */
export function setVaultSteps(type: string, steps: TxStep[]): void {
    let changed = false;
    ops = ops.map((o) => {
        if (o.type !== type) return o;
        changed = true;
        return { ...o, steps };
    });
    if (changed) { saveToStorage(ops); notify(); }
}

/** Mark all pending steps as error for a given op type */
export function markVaultStepsError(type: string, errorMsg: string): void {
    let changed = false;
    ops = ops.map((o) => {
        if (o.type !== type) return o;
        changed = true;
        const newSteps = o.steps.map((s): TxStep =>
            s.status === 'pending' ? { ...s, status: 'error' as const, error: errorMsg } : s,
        );
        return { ...o, steps: newSteps };
    });
    if (changed) { saveToStorage(ops); notify(); }
}

/** Set the awaitingConfirm flag */
export function setVaultAwaitingConfirm(type: string, awaitingConfirm: boolean): void {
    ops = ops.map((o) => (o.type === type ? { ...o, awaitingConfirm } : o));
    saveToStorage(ops);
    notify();
}

/** Remove a pending op by type */
export function removeVaultOp(type: string): void {
    const before = ops.length;
    ops = ops.filter((o) => o.type !== type);
    if (ops.length !== before) { saveToStorage(ops); notify(); }
}

/** Clear all pending ops for a specific wallet (used on wallet switch) */
export function clearVaultOpsForWallet(wallet: string): void {
    const lower = wallet.toLowerCase();
    const before = ops.length;
    ops = ops.filter((o) => o.walletAddress.toLowerCase() !== lower);
    if (ops.length !== before) { saveToStorage(ops); notify(); }
}

/** Synchronous read (for use outside React render — e.g., in async flow control) */
export function getVaultOp(type: string): VaultPendingOp | undefined {
    return ops.find((o) => o.type === type);
}

/* ── React hook ────────────────────────────────────────────────────────── */

/** Subscribe to all vault pending ops (module-level, immune to React state loss) */
export function useVaultPending(): VaultPendingOp[] {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
