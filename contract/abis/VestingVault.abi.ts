import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const VestingVaultEvents = [];

export const VestingVaultAbi = [
    {
        name: 'createSchedule',
        inputs: [
            { name: 'beneficiary', type: ABIDataTypes.EXTENDED_ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'totalAmount', type: ABIDataTypes.UINT256 },
            { name: 'cliffBlocks', type: ABIDataTypes.UINT256 },
            { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
            { name: 'revocable', type: ABIDataTypes.BOOL },
            { name: 'vestingType', type: ABIDataTypes.UINT256 },
            { name: 'stepsCount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claim',
        inputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'claimed', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'revoke',
        inputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'transferBeneficiary',
        inputs: [
            { name: 'scheduleId', type: ABIDataTypes.UINT256 },
            { name: 'newBeneficiary', type: ABIDataTypes.EXTENDED_ADDRESS },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getSchedule',
        inputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'creator', type: ABIDataTypes.EXTENDED_ADDRESS },
            { name: 'beneficiary', type: ABIDataTypes.EXTENDED_ADDRESS },
            { name: 'token', type: ABIDataTypes.ADDRESS },
            { name: 'totalAmount', type: ABIDataTypes.UINT256 },
            { name: 'claimedAmount', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'cliffBlocks', type: ABIDataTypes.UINT256 },
            { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
            { name: 'revocable', type: ABIDataTypes.BOOL },
            { name: 'revoked', type: ABIDataTypes.BOOL },
            { name: 'vestingType', type: ABIDataTypes.UINT256 },
            { name: 'stepsCount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getNextScheduleId',
        inputs: [],
        outputs: [{ name: 'nextId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getVestedAmount',
        inputs: [{ name: 'scheduleId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'vestedAmount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...VestingVaultEvents,
    ...OP_NET_ABI,
];

export default VestingVaultAbi;
