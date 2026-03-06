import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createOffer function call.
 */
export type CreateOffer = CallResult<
    {
        offerId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the acceptOffer function call.
 */
export type AcceptOffer = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the cancelOffer function call.
 */
export type CancelOffer = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getOffer function call.
 */
export type GetOffer = CallResult<
    {
        creator: Address;
        acceptor: Address;
        offeredToken: Address;
        offeredAmount: bigint;
        wantedToken: Address;
        wantedAmount: bigint;
        status: number;
        createdAt: number;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getNextOfferId function call.
 */
export type GetNextOfferId = CallResult<
    {
        nextId: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IOTCEscrow
// ------------------------------------------------------------------
export interface IOTCEscrow extends IOP_NETContract {
    createOffer(
        offeredToken: Address,
        offeredAmount: bigint,
        wantedToken: Address,
        wantedAmount: bigint,
    ): Promise<CreateOffer>;
    acceptOffer(offerId: bigint): Promise<AcceptOffer>;
    cancelOffer(offerId: bigint): Promise<CancelOffer>;
    getOffer(offerId: bigint): Promise<GetOffer>;
    getNextOfferId(): Promise<GetNextOfferId>;
}
