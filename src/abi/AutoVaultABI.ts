import {
    type BitcoinInterfaceAbi,
    type BaseContractProperties,
    type CallResult,
    BitcoinAbiTypes,
    ABIDataTypes,
} from 'opnet';

export const AUTO_VAULT_ABI: BitcoinInterfaceAbi = [
    // ── Write Methods ────────────────────────────────────────────────────────
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
    // ── Read Methods ─────────────────────────────────────────────────────────
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
];

/** TypeScript interface for the AutoVault contract */
export interface IAutoVaultContract extends BaseContractProperties {
    deposit(token: string, amount: bigint): Promise<CallResult<{ shares: bigint }>>;
    withdraw(token: string, shares: bigint): Promise<CallResult<{ netAmount: bigint }>>;
    compound(token: string): Promise<CallResult<{ compounded: bigint }>>;
    fundRewards(token: string, amount: bigint): Promise<CallResult<{ success: boolean }>>;
    setRewardRate(token: string, rate: bigint): Promise<CallResult<{ success: boolean }>>;
    setFees(newCompoundFeeBps: bigint, newWithdrawFeeBps: bigint): Promise<CallResult<{ success: boolean }>>;
    setFeeRecipient(recipient: string): Promise<CallResult<{ success: boolean }>>;

    getVaultInfo(token: string): Promise<CallResult<{
        totalStaked: bigint;
        totalShares: bigint;
        rewardRate: bigint;
        lastCompoundBlock: bigint;
        rewardPool: bigint;
        compoundFeeBps: bigint;
        withdrawFeeBps: bigint;
    }>>;
    getUserInfo(token: string, user: string): Promise<CallResult<{
        shares: bigint;
        stakedEquivalent: bigint;
        pendingRewardShare: bigint;
    }>>;
    getSharePrice(token: string): Promise<CallResult<{ pricePerShare: bigint }>>;
    getPendingRewards(token: string): Promise<CallResult<{ pending: bigint }>>;
    getFeeInfo(): Promise<CallResult<{
        compoundFeeBps: bigint;
        withdrawFeeBps: bigint;
        feeRecipient: string;
        totalFeesCollectedMoto: bigint;
        totalFeesCollectedPill: bigint;
    }>>;
    getTotalFeesCollected(token: string): Promise<CallResult<{ totalFees: bigint }>>;
}
