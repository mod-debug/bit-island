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
        offerType: number;
        status: number;
        createdAt: number;
        creator: Address;
        acceptor: Address;
        offeredCollection: Address;
        offeredTokenId: bigint;
        offeredAmount: bigint;
        wantedCollection: Address;
        wantedTokenId: bigint;
        wantedAmount: bigint;
        acceptorTokenId: bigint;
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
// INFTEscrow
// ------------------------------------------------------------------
export interface INFTEscrow extends IOP_NETContract {
    createOffer(
        offerType: number,
        offeredCollection: Address,
        offeredTokenId: bigint,
        offeredAmount: bigint,
        wantedCollection: Address,
        wantedTokenId: bigint,
        wantedAmount: bigint,
    ): Promise<CreateOffer>;
    acceptOffer(offerId: bigint, acceptorTokenId: bigint): Promise<AcceptOffer>;
    cancelOffer(offerId: bigint): Promise<CancelOffer>;
    getOffer(offerId: bigint): Promise<GetOffer>;
    getNextOfferId(): Promise<GetNextOfferId>;
}
