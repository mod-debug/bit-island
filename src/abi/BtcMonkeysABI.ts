import {
    type BitcoinInterfaceAbi,
    type BaseContractProperties,
    type CallResult,
    BitcoinAbiTypes,
    ABIDataTypes,
} from 'opnet';

export interface IBtcMonkeys extends BaseContractProperties {
    mint(): Promise<CallResult<{ tokenId: bigint }>>;
    balanceOf(owner: string): Promise<CallResult<{ balance: bigint }>>;
    totalSupply(): Promise<CallResult<{ total: bigint }>>;
    maxSupply(): Promise<CallResult<{ max: bigint }>>;
    mintPrice(): Promise<CallResult<{ price: bigint }>>;
}

export const BTC_MONKEYS_ABI: BitcoinInterfaceAbi = [
    {
        name: 'mint',
        inputs: [],
        outputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'balanceOf',
        inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'totalSupply',
        inputs: [],
        outputs: [{ name: 'total', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'maxSupply',
        inputs: [],
        outputs: [{ name: 'max', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'mintPrice',
        inputs: [],
        outputs: [{ name: 'price', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
];
