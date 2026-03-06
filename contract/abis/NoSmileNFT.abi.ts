import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const NoSmileNFTEvents = [];

export const NoSmileNFTAbi = [
    {
        name: 'mint',
        inputs: [
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'batchMint',
        inputs: [
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'startId', type: ABIDataTypes.UINT256 },
            { name: 'count', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    ...NoSmileNFTEvents,
    ...OP_NET_ABI,
];

export default NoSmileNFTAbi;
