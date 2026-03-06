import {
    type BitcoinInterfaceAbi,
    type BaseContractProperties,
    type CallResult,
    BitcoinAbiTypes,
    ABIDataTypes,
} from 'opnet';

export const VESTING_VAULT_ABI: BitcoinInterfaceAbi = [
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
        name: 'transferBeneficiary',
        inputs: [
            { name: 'scheduleId', type: ABIDataTypes.UINT256 },
            { name: 'newBeneficiary', type: ABIDataTypes.EXTENDED_ADDRESS },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
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
];

/** TypeScript interface for the Vesting Vault contract */
export interface IVestingVaultContract extends BaseContractProperties {
    createSchedule(
        beneficiary: string,
        token: string,
        totalAmount: bigint,
        cliffBlocks: bigint,
        durationBlocks: bigint,
        revocable: boolean,
        vestingType: bigint,
        stepsCount: bigint,
    ): Promise<CallResult<{ scheduleId: bigint }>>;

    claim(scheduleId: bigint): Promise<CallResult<{ claimed: bigint }>>;

    revoke(scheduleId: bigint): Promise<CallResult<{ success: boolean }>>;

    transferBeneficiary(scheduleId: bigint, newBeneficiary: string): Promise<CallResult<{ success: boolean }>>;

    getSchedule(scheduleId: bigint): Promise<
        CallResult<{
            creator: string;
            beneficiary: string;
            token: string;
            totalAmount: bigint;
            claimedAmount: bigint;
            startBlock: bigint;
            cliffBlocks: bigint;
            durationBlocks: bigint;
            revocable: boolean;
            revoked: boolean;
            vestingType: bigint;
            stepsCount: bigint;
        }>
    >;

    getNextScheduleId(): Promise<CallResult<{ nextId: bigint }>>;

    getVestedAmount(scheduleId: bigint): Promise<CallResult<{ vestedAmount: bigint }>>;
}
