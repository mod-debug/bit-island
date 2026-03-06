import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createSchedule function call.
 */
export type CreateSchedule = CallResult<
    {
        scheduleId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the claim function call.
 */
export type Claim = CallResult<
    {
        claimed: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the revoke function call.
 */
export type Revoke = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the transferBeneficiary function call.
 */
export type TransferBeneficiary = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getSchedule function call.
 */
export type GetSchedule = CallResult<
    {
        creator: Address;
        beneficiary: Address;
        token: Address;
        totalAmount: bigint;
        claimedAmount: bigint;
        startBlock: bigint;
        cliffBlocks: bigint;
        durationBlocks: bigint;
        revocable: boolean;
        revoked: boolean;
        vestingType: bigint;
        stepsCount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getNextScheduleId function call.
 */
export type GetNextScheduleId = CallResult<
    {
        nextId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getVestedAmount function call.
 */
export type GetVestedAmount = CallResult<
    {
        vestedAmount: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IVestingVault
// ------------------------------------------------------------------
export interface IVestingVault extends IOP_NETContract {
    createSchedule(
        beneficiary: Address,
        token: Address,
        totalAmount: bigint,
        cliffBlocks: bigint,
        durationBlocks: bigint,
        revocable: boolean,
        vestingType: bigint,
        stepsCount: bigint,
    ): Promise<CreateSchedule>;
    claim(scheduleId: bigint): Promise<Claim>;
    revoke(scheduleId: bigint): Promise<Revoke>;
    transferBeneficiary(scheduleId: bigint, newBeneficiary: Address): Promise<TransferBeneficiary>;
    getSchedule(scheduleId: bigint): Promise<GetSchedule>;
    getNextScheduleId(): Promise<GetNextScheduleId>;
    getVestedAmount(scheduleId: bigint): Promise<GetVestedAmount>;
}
