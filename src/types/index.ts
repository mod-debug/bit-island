// ── Week 1 types (kept for reference) ──────────────────────────────────────

export interface TokenConfig {
    name: string;
    symbol: string;
    decimals: number;
    maxSupply: bigint;
    description: string;
}

export interface LaunchedToken {
    id: string;
    name: string;
    symbol: string;
    decimals: number;
    maxSupply: bigint;
    contractAddress: string;
    deployTxId: string;
    creator: string;
    createdAt: number;
    description: string;
}

export interface DeploymentResult {
    contractAddress: string;
    contractPubKey: string;
    fundingTxId: string;
    deployTxId: string;
}

export interface IslandStats {
    totalTokens: number;
    totalCreators: number;
    latestToken: string | null;
}

export interface CollectionStats {
    totalMinted: bigint;
    maxSupply: bigint;
    mintPrice: bigint;
    ownerBalance: bigint;
}

export interface MintResult {
    tokenId: bigint;
    txId: string;
}

// ── Week 2: OTC Escrow types ────────────────────────────────────────────────

/** On-chain offer status values */
export const OFFER_STATUS = {
    ACTIVE: 0,
    ACCEPTED: 1,
    CANCELLED: 2,
} as const;

export type OfferStatus = (typeof OFFER_STATUS)[keyof typeof OFFER_STATUS];

/** A decoded OTC offer */
export interface Offer {
    readonly id: bigint;
    readonly creator: string;
    /** Wallet that accepted the offer (empty string if not yet accepted). */
    readonly acceptor: string;
    readonly offeredToken: string;
    readonly offeredAmount: bigint;
    readonly wantedToken: string;
    readonly wantedAmount: bigint;
    readonly status: OfferStatus;
    readonly createdAt: number;
}

/** Parameters for creating a new offer */
export interface CreateOfferParams {
    readonly offeredToken: string;
    readonly offeredAmount: bigint;
    readonly wantedToken: string;
    readonly wantedAmount: bigint;
}

/** Transaction step state for multi-step flows */
export interface TxStep {
    readonly label: string;
    readonly status: 'idle' | 'pending' | 'done' | 'error';
    readonly txId?: string;
    readonly error?: string;
}

/** OTC stats for the stats bar */
export interface OTCStats {
    readonly activeOffers: number;
    readonly totalOffers: number;
    readonly totalVolume: bigint;
}

/** Transaction history entry — one per on-chain tx */
export type TxAction = 'approve' | 'create' | 'accept' | 'cancel' | 'transfer';

export interface TxHistoryEntry {
    readonly id: number;
    readonly action: TxAction;
    readonly dealId: bigint | null;
    readonly txId: string;
    readonly timestamp: number;
    readonly status: 'ok' | 'error';
    readonly detail: string;
    readonly walletAddress: string;
}

// ── NFT Escrow types ───────────────────────────────────────────────────────

/** NFT offer type constants */
export const NFT_OFFER_TYPE = {
    NFT_FOR_NFT: 0,
    NFT_FOR_TOKEN: 1,
    TOKEN_FOR_NFT: 2,
} as const;

export type NftOfferType = (typeof NFT_OFFER_TYPE)[keyof typeof NFT_OFFER_TYPE];

/** NFT offer status (same as OTC) */
export const NFT_OFFER_STATUS = {
    ACTIVE: 0,
    ACCEPTED: 1,
    CANCELLED: 2,
} as const;

export type NftOfferStatus = (typeof NFT_OFFER_STATUS)[keyof typeof NFT_OFFER_STATUS];

/** A decoded NFT escrow offer */
export interface NftOffer {
    readonly id: bigint;
    readonly offerType: NftOfferType;
    readonly status: NftOfferStatus;
    readonly createdAt: number;
    readonly creator: string;
    readonly acceptor: string;
    readonly offeredCollection: string;
    readonly offeredTokenId: bigint;
    readonly offeredAmount: bigint;
    readonly wantedCollection: string;
    readonly wantedTokenId: bigint;
    readonly wantedAmount: bigint;
    readonly acceptorTokenId: bigint;
}

/** Parameters for creating a new NFT offer */
export interface CreateNftOfferParams {
    readonly offerType: NftOfferType;
    readonly offeredCollection: string;
    readonly offeredTokenId: bigint;
    readonly offeredAmount: bigint;
    readonly wantedCollection: string;
    readonly wantedTokenId: bigint;
    readonly wantedAmount: bigint;
}

// ── Week 3: Vesting Vault types ────────────────────────────────────────────

/** Schedule status values */
export const SCHEDULE_STATUS = {
    ACTIVE: 0,
    REVOKED: 1,
    FULLY_VESTED: 2,
    CLIFF_PENDING: 3,
} as const;

export type ScheduleStatus = (typeof SCHEDULE_STATUS)[keyof typeof SCHEDULE_STATUS];

/** A decoded vesting schedule */
export interface VestingSchedule {
    readonly id: bigint;
    readonly creator: string;
    readonly beneficiary: string;
    readonly token: string;
    readonly totalAmount: bigint;
    readonly claimedAmount: bigint;
    readonly startBlock: bigint;
    readonly cliffBlocks: bigint;
    readonly durationBlocks: bigint;
    readonly revocable: boolean;
    readonly revoked: boolean;
    /** 0 = linear, 1 = stepped */
    readonly vestingType: number;
    /** Number of steps (only relevant when vestingType === 1) */
    readonly stepsCount: number;
    /** Computed fields (set by frontend) */
    readonly vestedAmount: bigint;
    readonly claimableAmount: bigint;
    readonly status: ScheduleStatus;
    readonly progressPercent: number;
}

/** Parameters for creating a new vesting schedule */
export interface CreateScheduleParams {
    readonly beneficiary: string;
    readonly token: string;
    readonly totalAmount: bigint;
    readonly cliffBlocks: bigint;
    readonly durationBlocks: bigint;
    readonly revocable: boolean;
    /** 0 = linear, 1 = stepped */
    readonly vestingType: number;
    /** Number of steps (only relevant when vestingType === 1) */
    readonly stepsCount: number;
}

/** Per-token TVL entry */
export interface TokenTvl {
    readonly token: string;
    readonly amount: bigint;
}

// ── Auto-Compound Vault types ───────────────────────────────────────────

/** On-chain vault info for a specific token */
export interface VaultInfo {
    readonly totalStaked: bigint;
    readonly totalShares: bigint;
    readonly rewardRate: bigint;
    readonly lastCompoundBlock: bigint;
    readonly rewardPool: bigint;
    readonly compoundFeeBps: bigint;
    readonly withdrawFeeBps: bigint;
}

/** User position in the vault for a specific token */
export interface UserVaultInfo {
    readonly shares: bigint;
    readonly stakedEquivalent: bigint;
    readonly pendingRewardShare: bigint;
}

/** Vault history entry stored in localStorage */
export interface VaultHistoryEntry {
    readonly id: number;
    readonly action: 'deposit' | 'withdraw' | 'compound' | 'fund' | 'set-rate' | 'set-fees';
    readonly token: string;
    readonly tokenSymbol: string;
    readonly amount: bigint;
    readonly fee: bigint;
    readonly shares: bigint;
    readonly txId: string;
    readonly timestamp: number;
    readonly walletAddress: string;
}

/** Vesting stats for the stats bar */
export interface VestingStats {
    readonly activeSchedules: number;
    readonly totalSchedules: number;
    readonly totalClaimed: number;
    readonly yourClaimable: bigint;
    readonly totalValueLocked: bigint;
    readonly tvlByToken: readonly TokenTvl[];
}
