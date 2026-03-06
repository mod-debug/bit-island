import {
    type BitcoinInterfaceAbi,
    type BaseContractProperties,
    type CallResult,
    BitcoinAbiTypes,
    ABIDataTypes,
} from 'opnet';

export const OTC_ESCROW_ABI: BitcoinInterfaceAbi = [
    {
        name: 'createOffer',
        inputs: [
            { name: 'offeredToken', type: ABIDataTypes.ADDRESS },
            { name: 'offeredAmount', type: ABIDataTypes.UINT256 },
            { name: 'wantedToken', type: ABIDataTypes.ADDRESS },
            { name: 'wantedAmount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'acceptOffer',
        inputs: [{ name: 'offerId', type: ABIDataTypes.UINT256 }],
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
            { name: 'creator', type: ABIDataTypes.EXTENDED_ADDRESS },
            { name: 'acceptor', type: ABIDataTypes.EXTENDED_ADDRESS },
            { name: 'offeredToken', type: ABIDataTypes.ADDRESS },
            { name: 'offeredAmount', type: ABIDataTypes.UINT256 },
            { name: 'wantedToken', type: ABIDataTypes.ADDRESS },
            { name: 'wantedAmount', type: ABIDataTypes.UINT256 },
            { name: 'status', type: ABIDataTypes.UINT8 },
            { name: 'createdAt', type: ABIDataTypes.UINT32 },
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

/** TypeScript interface for the OTC Escrow contract */
export interface IOTCEscrowContract extends BaseContractProperties {
    createOffer(
        offeredToken: string,
        offeredAmount: bigint,
        wantedToken: string,
        wantedAmount: bigint,
    ): Promise<CallResult<{ offerId: bigint }>>;

    acceptOffer(offerId: bigint): Promise<CallResult<{ success: boolean }>>;

    cancelOffer(offerId: bigint): Promise<CallResult<{ success: boolean }>>;

    getOffer(offerId: bigint): Promise<
        CallResult<{
            creator: string;
            acceptor: string;
            offeredToken: string;
            offeredAmount: bigint;
            wantedToken: string;
            wantedAmount: bigint;
            status: bigint;
            createdAt: bigint;
        }>
    >;

    getNextOfferId(): Promise<CallResult<{ nextId: bigint }>>;
}
