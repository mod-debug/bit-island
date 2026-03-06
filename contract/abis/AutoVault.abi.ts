import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const AutoVaultEvents = [];

export const AutoVaultAbi = [
    {
        name: 'deposit',
        inputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'shares', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'withdraw',
        inputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'shares', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'netAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'compound',
        inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'compounded', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'fundRewards',
        inputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setRewardRate',
        inputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'rate', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setFees',
        inputs: [
            { name: 'newCompoundFeeBps', type: ABIDataTypes.UINT256 },
            { name: 'newWithdrawFeeBps', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'setFeeRecipient',
        inputs: [{ name: 'recipient', type: ABIDataTypes.EXTENDED_ADDRESS }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getVaultInfo',
        inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'totalStaked', type: ABIDataTypes.UINT256 },
            { name: 'totalShares', type: ABIDataTypes.UINT256 },
            { name: 'rewardRate', type: ABIDataTypes.UINT256 },
            { name: 'lastCompoundBlock', type: ABIDataTypes.UINT256 },
            { name: 'rewardPool', type: ABIDataTypes.UINT256 },
            { name: 'compoundFeeBps', type: ABIDataTypes.UINT256 },
            { name: 'withdrawFeeBps', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getUserInfo',
        inputs: [
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'user', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'shares', type: ABIDataTypes.UINT256 },
            { name: 'stakedEquivalent', type: ABIDataTypes.UINT256 },
            { name: 'pendingRewardShare', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getSharePrice',
        inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'pricePerShare', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPendingRewards',
        inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'pending', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getFeeInfo',
        inputs: [],
        outputs: [
            { name: 'compoundFeeBps', type: ABIDataTypes.UINT256 },
            { name: 'withdrawFeeBps', type: ABIDataTypes.UINT256 },
            { name: 'feeRecipient', type: ABIDataTypes.EXTENDED_ADDRESS },
            { name: 'totalFeesCollectedMoto', type: ABIDataTypes.UINT256 },
            { name: 'totalFeesCollectedPill', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTotalFeesCollected',
        inputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'totalFees', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...AutoVaultEvents,
    ...OP_NET_ABI,
];

export default AutoVaultAbi;
