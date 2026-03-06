import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the mint function call.
 */
export type Mint = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the batchMint function call.
 */
export type BatchMint = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// INoSmileNFT
// ------------------------------------------------------------------
export interface INoSmileNFT extends IOP_NETContract {
    mint(to: Address, tokenId: bigint): Promise<Mint>;
    batchMint(to: Address, startId: bigint, count: bigint): Promise<BatchMint>;
}
