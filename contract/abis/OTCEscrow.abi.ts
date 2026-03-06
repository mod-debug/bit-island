import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const OTCEscrowEvents = [];

export const OTCEscrowAbi = [
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
    ...OTCEscrowEvents,
    ...OP_NET_ABI,
];

export default OTCEscrowAbi;
