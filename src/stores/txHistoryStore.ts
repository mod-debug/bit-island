import { useSyncExternalStore } from 'react';
import type { TxHistoryEntry, TxAction } from '../types/index.js';

const STORAGE_KEY = 'btcmonkeys-tx-history';
const MAX_ENTRIES = 200;

interface StoredEntry {
    readonly id: number;
    readonly action: string;
    readonly dealId: string | null;
    readonly txId: string;
    readonly timestamp: number;
    readonly status: 'ok' | 'error';
    readonly detail: string;
    readonly walletAddress: string;
}

function saveToStorage(data: TxHistoryEntry[]): void {
    try {
        const serializable: StoredEntry[] = data.map((e) => ({
            id: e.id,
            action: e.action,
            dealId: e.dealId !== null ? e.dealId.toString() : null,
            txId: e.txId,
            timestamp: e.timestamp,
            status: e.status,
            detail: e.detail,
            walletAddress: e.walletAddress,
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch { /* quota exceeded — silently ignore */ }
}

function loadFromStorage(): TxHistoryEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        const parsed = JSON.parse(raw) as StoredEntry[];
        return parsed.map((e) => ({
            id: e.id,
            action: e.action as TxAction,
            dealId: e.dealId !== null ? BigInt(e.dealId) : null,
            txId: e.txId,
            timestamp: e.timestamp,
            status: e.status,
            detail: e.detail,
            walletAddress: e.walletAddress ?? '',
        }));
    } catch {
        return [];
    }
}

let entries: TxHistoryEntry[] = loadFromStorage();
let nextId = entries.length > 0 ? Math.max(...entries.map((e) => e.id)) : 0;

const listeners = new Set<() => void>();

function notify(): void {
    for (const fn of listeners) fn();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function getSnapshot(): TxHistoryEntry[] {
    return entries;
}

export function addTxEntry(action: TxAction, dealId: bigint | null, txId: string, status: 'ok' | 'error', detail: string, walletAddress: string): void {
    nextId += 1;
    const entry: TxHistoryEntry = {
        id: nextId,
        action,
        dealId,
        txId,
        timestamp: Date.now(),
        status,
        detail,
        walletAddress,
    };
    entries = [entry, ...entries];
    if (entries.length > MAX_ENTRIES) {
        entries = entries.slice(0, MAX_ENTRIES);
    }
    saveToStorage(entries);
    notify();
}

export function clearTxHistory(): void {
    entries = [];
    nextId = 0;
    localStorage.removeItem(STORAGE_KEY);
    notify();
}

/**
 * Look up the most relevant transaction ID for a given deal.
 * Prioritizes: cancel/accept (closing tx) > create > approve.
 * Returns the txId string, or null if no matching entry found.
 */
export function getTxIdForDeal(dealId: bigint): string | null {
    const priority: Record<string, number> = { cancel: 3, accept: 3, create: 2, approve: 1 };
    let best: TxHistoryEntry | null = null;
    let bestScore = 0;
    for (const e of entries) {
        if (e.dealId === dealId && e.status === 'ok' && e.txId.length > 0) {
            const score = priority[e.action] ?? 0;
            if (score > bestScore) {
                best = e;
                bestScore = score;
            }
        }
    }
    return best !== null ? best.txId : null;
}

export function useTxHistory(): TxHistoryEntry[] {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
