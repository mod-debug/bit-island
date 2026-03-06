import {
    type BitcoinInterfaceAbi,
    type BaseContractProperties,
    type CallResult,
    BitcoinAbiTypes,
    ABIDataTypes,
} from 'opnet';

export const NFT_ESCROW_ABI: BitcoinInterfaceAbi = [
    {
        name: 'createOffer',
        inputs: [
            { name: 'offerType', type: ABIDataTypes.UINT8 },
            { name: 'offeredCollection', type: ABIDataTypes.ADDRESS },
            { name: 'offeredTokenId', type: ABIDataTypes.UINT256 },
            { name: 'offeredAmount', type: ABIDataTypes.UINT256 },
            { name: 'wantedCollection', type: ABIDataTypes.ADDRESS },
            { name: 'wantedTokenId', type: ABIDataTypes.UINT256 },
            { name: 'wantedAmount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'acceptOffer',
        inputs: [
            { name: 'offerId', type: ABIDataTypes.UINT256 },
            { name: 'acceptorTokenId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'cancelOffer',
        inputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getOffer',
        inputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'offerType', type: ABIDataTypes.UINT8 },
            { name: 'status', type: ABIDataTypes.UINT8 },
            { name: 'createdAt', type: ABIDataTypes.UINT32 },
            { name: 'creator', type: ABIDataTypes.EXTENDED_ADDRESS },
            { name: 'acceptor', type: ABIDataTypes.EXTENDED_ADDRESS },
            { name: 'offeredCollection', type: ABIDataTypes.ADDRESS },
            { name: 'offeredTokenId', type: ABIDataTypes.UINT256 },
            { name: 'offeredAmount', type: ABIDataTypes.UINT256 },
            { name: 'wantedCollection', type: ABIDataTypes.ADDRESS },
            { name: 'wantedTokenId', type: ABIDataTypes.UINT256 },
            { name: 'wantedAmount', type: ABIDataTypes.UINT256 },
            { name: 'acceptorTokenId', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getNextOfferId',
        inputs: [],
        outputs: [{ name: 'nextId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
];

/** TypeScript interface for the NFT Escrow contract */
export interface INFTEscrowContract extends BaseContractProperties {
    createOffer(
        offerType: number,
        offeredCollection: string,
        offeredTokenId: bigint,
        offeredAmount: bigint,
        wantedCollection: string,
        wantedTokenId: bigint,
        wantedAmount: bigint,
    ): Promise<CallResult<{ offerId: bigint }>>;

    acceptOffer(
        offerId: bigint,
        acceptorTokenId: bigint,
    ): Promise<CallResult<{ success: boolean }>>;

    cancelOffer(offerId: bigint): Promise<CallResult<{ success: boolean }>>;

    getOffer(offerId: bigint): Promise<
        CallResult<{
            offerType: bigint;
            status: bigint;
            createdAt: bigint;
            creator: string;
            acceptor: string;
            offeredCollection: string;
            offeredTokenId: bigint;
            offeredAmount: bigint;
            wantedCollection: string;
            wantedTokenId: bigint;
            wantedAmount: bigint;
            acceptorTokenId: bigint;
        }>
    >;

    getNextOfferId(): Promise<CallResult<{ nextId: bigint }>>;
}
