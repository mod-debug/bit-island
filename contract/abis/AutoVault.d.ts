import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the deposit function call.
 */
export type Deposit = CallResult<
    {
        shares: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the withdraw function call.
 */
export type Withdraw = CallResult<
    {
        netAmount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the compound function call.
 */
export type Compound = CallResult<
    {
        compounded: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the fundRewards function call.
 */
export type FundRewards = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setRewardRate function call.
 */
export type SetRewardRate = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setFees function call.
 */
export type SetFees = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the setFeeRecipient function call.
 */
export type SetFeeRecipient = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getVaultInfo function call.
 */
export type GetVaultInfo = CallResult<
    {
        totalStaked: bigint;
        totalShares: bigint;
        rewardRate: bigint;
        lastCompoundBlock: bigint;
        rewardPool: bigint;
        compoundFeeBps: bigint;
        withdrawFeeBps: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getUserInfo function call.
 */
export type GetUserInfo = CallResult<
    {
        shares: bigint;
        stakedEquivalent: bigint;
        pendingRewardShare: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getSharePrice function call.
 */
export type GetSharePrice = CallResult<
    {
        pricePerShare: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPendingRewards function call.
 */
export type GetPendingRewards = CallResult<
    {
        pending: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getFeeInfo function call.
 */
export type GetFeeInfo = CallResult<
    {
        compoundFeeBps: bigint;
        withdrawFeeBps: bigint;
        feeRecipient: Address;
        totalFeesCollectedMoto: bigint;
        totalFeesCollectedPill: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getTotalFeesCollected function call.
 */
export type GetTotalFeesCollected = CallResult<
    {
        totalFees: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IAutoVault
// ------------------------------------------------------------------
export interface IAutoVault extends IOP_NETContract {
    deposit(token: Address, amount: bigint): Promise<Deposit>;
    withdraw(token: Address, shares: bigint): Promise<Withdraw>;
    compound(token: Address): Promise<Compound>;
    fundRewards(token: Address, amount: bigint): Promise<FundRewards>;
    setRewardRate(token: Address, rate: bigint): Promise<SetRewardRate>;
    setFees(newCompoundFeeBps: bigint, newWithdrawFeeBps: bigint): Promise<SetFees>;
    setFeeRecipient(recipient: Address): Promise<SetFeeRecipient>;
    getVaultInfo(token: Address): Promise<GetVaultInfo>;
    getUserInfo(token: Address, user: Address): Promise<GetUserInfo>;
    getSharePrice(token: Address): Promise<GetSharePrice>;
    getPendingRewards(token: Address): Promise<GetPendingRewards>;
    getFeeInfo(): Promise<GetFeeInfo>;
    getTotalFeesCollected(token: Address): Promise<GetTotalFeesCollected>;
}
