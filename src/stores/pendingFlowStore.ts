import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'btcmonkeys-pending-flows';

/** Stages of a pending multi-step flow */
export type FlowStage = 'approved' | 'confirming' | 'ready' | 'finalizing';

/** A persisted in-progress flow (approve done, finalize not yet) */
export interface PendingFlow {
    readonly id: string;
    readonly type: 'create' | 'accept' | 'claim' | 'revoke' | 'nft-create' | 'nft-accept';
    readonly stage: FlowStage;
    readonly walletAddress: string;
    readonly approveTxId: string;
    readonly startedAt: number;
    /** Create-specific: token being offered */
    readonly offeredToken?: string;
    /** Create-specific: amount as string (bigint serialized) */
    readonly offeredAmount?: string;
    /** Create-specific: token wanted in return */
    readonly wantedToken?: string;
    /** Create-specific: wanted amount as string */
    readonly wantedAmount?: string;
    /** Accept-specific: on-chain offer ID as string */
    readonly offerId?: string;
    /** Human-readable description, e.g. "150 MOTO -> 200 PILL" */
    readonly description?: string;
    /** TX ID of the final transaction (create/accept), set when stage = 'finalizing' */
    readonly finalizeTxId?: string;
    /** Vesting-specific: beneficiary address */
    readonly beneficiary?: string;
    /** Vesting-specific: token contract address */
    readonly token?: string;
    /** Vesting-specific: total amount as string (bigint serialized) */
    readonly totalAmount?: string;
    /** Vesting-specific: cliff duration in blocks */
    readonly cliffBlocks?: string;
    /** Vesting-specific: total duration in blocks */
    readonly durationBlocks?: string;
    /** Vesting-specific: whether schedule is revocable */
    readonly revocable?: boolean;
    /** Vesting-specific: 0 = linear, 1 = stepped */
    readonly vestingType?: number;
    /** Vesting-specific: number of steps (stepped vesting) */
    readonly stepsCount?: number;
    /** NFT-specific: offer type (0=NFT↔NFT, 1=NFT→Token, 2=Token→NFT) */
    readonly nftOfferType?: number;
    /** NFT-specific: collection address */
    readonly nftCollection?: string;
    /** NFT-specific: token ID as string */
    readonly nftTokenId?: string;
    /** NFT-specific: wanted collection address */
    readonly nftWantedCollection?: string;
    /** NFT-specific: wanted token ID as string */
    readonly nftWantedTokenId?: string;
    /** NFT-specific: wanted amount as string */
    readonly nftWantedAmount?: string;
    /** NFT-specific: offered amount as string */
    readonly nftOfferedAmount?: string;
    /** Vesting claim queue: on-chain schedule ID as string (used by executeQueuedClaim) */
    readonly scheduleId?: string;
}

/** Serialization-safe shape (same as PendingFlow since no bigint fields) */
type StoredFlow = PendingFlow;

function saveToStorage(data: PendingFlow[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* quota exceeded — silently ignore */ }
}

function loadFromStorage(): PendingFlow[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        return JSON.parse(raw) as StoredFlow[];
    } catch {
        return [];
    }
}

let flows: PendingFlow[] = loadFromStorage();

const listeners = new Set<() => void>();

function notify(): void {
    for (const fn of listeners) fn();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function getSnapshot(): PendingFlow[] {
    return flows;
}

/** Add a new pending flow to the store */
export function addPendingFlow(flow: PendingFlow): void {
    flows = [flow, ...flows];
    saveToStorage(flows);
    notify();
}

/** Update the stage of an existing flow */
export function updateFlowStage(flowId: string, stage: FlowStage, finalizeTxId?: string): void {
    flows = flows.map((f) => {
        if (f.id !== flowId) return f;
        const updated = { ...f, stage };
        if (finalizeTxId !== undefined) {
            return { ...updated, finalizeTxId };
        }
        return updated;
    });
    saveToStorage(flows);
    notify();
}

/** Update multiple fields on an existing flow (used by claimAll + executeQueuedClaim) */
export function updateFlowFields(flowId: string, fields: { stage?: FlowStage; description?: string; finalizeTxId?: string; approveTxId?: string }): void {
    flows = flows.map((f) => {
        if (f.id !== flowId) return f;
        return { ...f, ...fields };
    });
    saveToStorage(flows);
    notify();
}

/** Remove a flow (after completion or dismissal) */
export function removePendingFlow(flowId: string): void {
    flows = flows.filter((f) => f.id !== flowId);
    saveToStorage(flows);
    notify();
}

/** Get all flows for a specific wallet address */
export function getPendingFlowsForWallet(walletAddress: string): PendingFlow[] {
    const lower = walletAddress.toLowerCase();
    return flows.filter((f) => f.walletAddress.toLowerCase() === lower);
}

/** Check if a given approveTxId has a pending flow */
export function hasPendingFlowForTx(approveTxId: string): boolean {
    return flows.some((f) => f.approveTxId === approveTxId);
}

/** React hook — subscribes to all pending flows */
export function usePendingFlows(): PendingFlow[] {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
