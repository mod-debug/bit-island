import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const NFTEscrowEvents = [];

export const NFTEscrowAbi = [
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
    ...NFTEscrowEvents,
    ...OP_NET_ABI,
];

export default NFTEscrowAbi;
