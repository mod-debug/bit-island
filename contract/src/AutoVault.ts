import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    ExtendedAddress,
    Blockchain,
    BytesWriter,
    Calldata,
    OP_NET,
    StoredBoolean,
    StoredMapU256,
    StoredU256,
    encodeSelector,
    Revert,
    SafeMath,
    ADDRESS_BYTE_LENGTH,
    EXTENDED_ADDRESS_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

const SEL_TRANSFER: u32 = encodeSelector('transfer(address,uint256)');
const SEL_TRANSFER_FROM: u32 = encodeSelector('transferFrom(address,address,uint256)');

const ZERO: u256 = u256.Zero;
const ONE: u256 = u256.One;
const BPS_BASE: u256 = u256.fromU32(10000);
const MAX_COMPOUND_FEE_BPS: u256 = u256.fromU32(1000);  // 10% max
const MAX_WITHDRAW_FEE_BPS: u256 = u256.fromU32(500);   // 5% max
const DEFAULT_COMPOUND_FEE: u256 = u256.fromU32(100);    // 1%
const DEFAULT_WITHDRAW_FEE: u256 = u256.fromU32(50);     // 0.5%
const ONE_E18: u256 = u256.fromU64(1_000_000_000_000_000_000);

// Response sizes
const VAULT_INFO_SIZE: i32 = 32 * 7;  // 224 bytes
const USER_INFO_SIZE: i32 = 32 * 3;   // 96 bytes
const FEE_INFO_SIZE: i32 = 32 * 4 + EXTENDED_ADDRESS_BYTE_LENGTH;

function u256ToAddress(val: u256): Address {
    return Address.fromUint8Array(val.toUint8Array(true));
}

function addressToU256(addr: Address): u256 {
    return u256.fromUint8ArrayBE(addr);
}

/**
 * Auto-Compound Vault — Monkey Vault
 *
 * Share-based vault (ERC-4626 style) with on-chain compound and withdrawal fees.
 *
 * Flow:
 *   1. Users deposit tokens and receive proportional shares
 *   2. Anyone calls compound() to distribute accumulated rewards (minus compound fee)
 *   3. Share price increases as rewards are added to the pool
 *   4. Users withdraw by burning shares at current ratio (minus withdrawal fee)
 *   5. Fees go to the configurable feeRecipient
 */
@final
export class AutoVault extends OP_NET {
    // ── Storage pointer declarations ─────────────────────────────────────────
    private readonly lockedPtr: u16 = Blockchain.nextPointer;

    // Fee settings (global — StoredU256)
    private readonly compoundFeeBpsPtr: u16 = Blockchain.nextPointer;
    private readonly withdrawFeeBpsPtr: u16 = Blockchain.nextPointer;
    private readonly feeRecipientPtr: u16 = Blockchain.nextPointer;
    private readonly feeRecipientTweakedPtr: u16 = Blockchain.nextPointer;
    private readonly deployerPtr: u16 = Blockchain.nextPointer;

    // Per-token vault data (StoredMapU256 : tokenAddress → value)
    private readonly totalStakedPtr: u16 = Blockchain.nextPointer;
    private readonly totalSharesPtr: u16 = Blockchain.nextPointer;
    private readonly rewardRatePtr: u16 = Blockchain.nextPointer;
    private readonly lastCompoundBlockPtr: u16 = Blockchain.nextPointer;
    private readonly rewardPoolPtr: u16 = Blockchain.nextPointer;
    private readonly totalFeesCollectedPtr: u16 = Blockchain.nextPointer;

    // Per-token per-user data (SHA256(token + user) → shares)
    private readonly userSharesPtr: u16 = Blockchain.nextPointer;

    // ── Storage instances ────────────────────────────────────────────────────
    private readonly locked: StoredBoolean = new StoredBoolean(this.lockedPtr, false);

    private readonly compoundFeeBpsStore: StoredU256 = new StoredU256(
        this.compoundFeeBpsPtr,
        new Uint8Array(30),
    );
    private readonly withdrawFeeBpsStore: StoredU256 = new StoredU256(
        this.withdrawFeeBpsPtr,
        new Uint8Array(29),
    );
    private readonly feeRecipientStore: StoredU256 = new StoredU256(
        this.feeRecipientPtr,
        new Uint8Array(28),
    );
    private readonly feeRecipientTweakedStore: StoredU256 = new StoredU256(
        this.feeRecipientTweakedPtr,
        new Uint8Array(27),
    );
    private readonly deployerStore: StoredU256 = new StoredU256(
        this.deployerPtr,
        new Uint8Array(26),
    );

    private readonly totalStakedMap: StoredMapU256 = new StoredMapU256(this.totalStakedPtr);
    private readonly totalSharesMap: StoredMapU256 = new StoredMapU256(this.totalSharesPtr);
    private readonly rewardRateMap: StoredMapU256 = new StoredMapU256(this.rewardRatePtr);
    private readonly lastCompoundBlockMap: StoredMapU256 = new StoredMapU256(this.lastCompoundBlockPtr);
    private readonly rewardPoolMap: StoredMapU256 = new StoredMapU256(this.rewardPoolPtr);
    private readonly totalFeesCollectedMap: StoredMapU256 = new StoredMapU256(this.totalFeesCollectedPtr);
    private readonly userSharesMap: StoredMapU256 = new StoredMapU256(this.userSharesPtr);

    public constructor() {
        super();
    }

    // ── Deployment ───────────────────────────────────────────────────────────

    public override onDeployment(calldata: Calldata): void {
        // Read deployer address from calldata (avoids Blockchain.tx.sender which requires ML-DSA linking)
        const deployer: Address = calldata.readAddress();

        this.deployerStore.value = addressToU256(deployer);

        this.compoundFeeBpsStore.value = DEFAULT_COMPOUND_FEE;
        this.withdrawFeeBpsStore.value = DEFAULT_WITHDRAW_FEE;

        // Set fee recipient to deployer (tweaked key set to zero; updated via setFeeRecipient later)
        this.feeRecipientStore.value = addressToU256(deployer);
        this.feeRecipientTweakedStore.value = ZERO;
    }

    // ── Write Methods ────────────────────────────────────────────────────────

    @method(
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'shares', type: ABIDataTypes.UINT256 })
    public deposit(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const token: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        if (u256.eq(amount, ZERO)) throw new Revert('Amount must be > 0');

        const tokenKey: u256 = addressToU256(token);
        const totalStaked: u256 = this.totalStakedMap.get(tokenKey);
        const totalShares: u256 = this.totalSharesMap.get(tokenKey);

        // Calculate shares
        let shares: u256;
        if (u256.eq(totalShares, ZERO)) {
            shares = amount;
        } else {
            shares = SafeMath.div(SafeMath.mul(amount, totalShares), totalStaked);
        }

        if (u256.eq(shares, ZERO)) throw new Revert('Shares must be > 0');

        // Effects: update state BEFORE interactions
        const userKey: u256 = this.getUserSharesKey(token, Blockchain.tx.sender);
        const currentUserShares: u256 = this.userSharesMap.get(userKey);
        this.userSharesMap.set(userKey, SafeMath.add(currentUserShares, shares));
        this.totalSharesMap.set(tokenKey, SafeMath.add(totalShares, shares));
        this.totalStakedMap.set(tokenKey, SafeMath.add(totalStaked, amount));

        // Interaction: transfer tokens in
        this.op20TransferFrom(token, Blockchain.tx.sender, this.address, amount);

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(shares);
        return writer;
    }

    @method(
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'shares', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'netAmount', type: ABIDataTypes.UINT256 })
    public withdraw(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const token: Address = calldata.readAddress();
        const shares: u256 = calldata.readU256();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        if (u256.eq(shares, ZERO)) throw new Revert('Shares must be > 0');

        const userKey: u256 = this.getUserSharesKey(token, Blockchain.tx.sender);
        const userShares: u256 = this.userSharesMap.get(userKey);
        if (u256.gt(shares, userShares)) throw new Revert('Insufficient shares');

        const tokenKey: u256 = addressToU256(token);
        const totalStaked: u256 = this.totalStakedMap.get(tokenKey);
        const totalShares: u256 = this.totalSharesMap.get(tokenKey);

        if (u256.eq(totalShares, ZERO)) throw new Revert('No shares exist');

        // Calculate gross amount
        const grossAmount: u256 = SafeMath.div(SafeMath.mul(shares, totalStaked), totalShares);

        // Calculate withdrawal fee
        const withdrawFeeBps: u256 = this.withdrawFeeBpsStore.value;
        const fee: u256 = SafeMath.div(SafeMath.mul(grossAmount, withdrawFeeBps), BPS_BASE);
        const netAmount: u256 = SafeMath.sub(grossAmount, fee);

        // Effects: update state BEFORE interactions
        this.userSharesMap.set(userKey, SafeMath.sub(userShares, shares));
        this.totalSharesMap.set(tokenKey, SafeMath.sub(totalShares, shares));
        this.totalStakedMap.set(tokenKey, SafeMath.sub(totalStaked, grossAmount));

        if (u256.gt(fee, ZERO)) {
            const currentFees: u256 = this.totalFeesCollectedMap.get(tokenKey);
            this.totalFeesCollectedMap.set(tokenKey, SafeMath.add(currentFees, fee));
        }

        // Interactions: send tokens out
        if (u256.gt(fee, ZERO)) {
            const feeRecipient: Address = u256ToAddress(this.feeRecipientStore.value);
            this.op20Transfer(token, feeRecipient, fee);
        }
        this.op20Transfer(token, Blockchain.tx.sender, netAmount);

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(netAmount);
        return writer;
    }

    @method({ name: 'token', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'compounded', type: ABIDataTypes.UINT256 })
    public compound(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const token: Address = calldata.readAddress();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        const tokenKey: u256 = addressToU256(token);
        const totalStaked: u256 = this.totalStakedMap.get(tokenKey);
        if (u256.eq(totalStaked, ZERO)) throw new Revert('No stakers');

        const rewardRate: u256 = this.rewardRateMap.get(tokenKey);
        const lastCompoundBlock: u256 = this.lastCompoundBlockMap.get(tokenKey);
        const currentBlock: u256 = u256.fromU64(<u64>Blockchain.block.number);
        const rewardPool: u256 = this.rewardPoolMap.get(tokenKey);

        // Calculate pending rewards
        let pendingRewards: u256 = ZERO;
        if (u256.gt(currentBlock, lastCompoundBlock)) {
            const blockDiff: u256 = SafeMath.sub(currentBlock, lastCompoundBlock);
            pendingRewards = SafeMath.mul(blockDiff, rewardRate);
        }

        // Cap to available reward pool
        if (u256.gt(pendingRewards, rewardPool)) {
            pendingRewards = rewardPool;
        }

        if (u256.eq(pendingRewards, ZERO)) throw new Revert('Nothing to compound');

        // Calculate compound fee
        const compoundFeeBps: u256 = this.compoundFeeBpsStore.value;
        const fee: u256 = SafeMath.div(SafeMath.mul(pendingRewards, compoundFeeBps), BPS_BASE);
        const netRewards: u256 = SafeMath.sub(pendingRewards, fee);

        // Effects: update state BEFORE interactions
        this.lastCompoundBlockMap.set(tokenKey, currentBlock);
        this.rewardPoolMap.set(tokenKey, SafeMath.sub(rewardPool, pendingRewards));
        this.totalStakedMap.set(tokenKey, SafeMath.add(totalStaked, netRewards));

        if (u256.gt(fee, ZERO)) {
            const currentFees: u256 = this.totalFeesCollectedMap.get(tokenKey);
            this.totalFeesCollectedMap.set(tokenKey, SafeMath.add(currentFees, fee));
        }

        // Interaction: send fee to recipient
        if (u256.gt(fee, ZERO)) {
            const feeRecipient: Address = u256ToAddress(this.feeRecipientStore.value);
            this.op20Transfer(token, feeRecipient, fee);
        }

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(netRewards);
        return writer;
    }

    @method(
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public fundRewards(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const token: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        if (u256.eq(amount, ZERO)) throw new Revert('Amount must be > 0');

        // Effects first
        const tokenKey: u256 = addressToU256(token);
        const currentPool: u256 = this.rewardPoolMap.get(tokenKey);
        this.rewardPoolMap.set(tokenKey, SafeMath.add(currentPool, amount));

        // Initialize lastCompoundBlock if first funding
        const lastBlock: u256 = this.lastCompoundBlockMap.get(tokenKey);
        if (u256.eq(lastBlock, ZERO)) {
            this.lastCompoundBlockMap.set(tokenKey, u256.fromU64(<u64>Blockchain.block.number));
        }

        // Interaction: transfer tokens in
        this.op20TransferFrom(token, Blockchain.tx.sender, this.address, amount);

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method(
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'rate', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setRewardRate(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const token: Address = calldata.readAddress();
        const rate: u256 = calldata.readU256();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        this.assertOwner();

        // Auto-compound before changing rate (to not lose pending rewards)
        const tokenKey: u256 = addressToU256(token);
        this.internalCompound(tokenKey, token);

        this.rewardRateMap.set(tokenKey, rate);

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method(
        { name: 'newCompoundFeeBps', type: ABIDataTypes.UINT256 },
        { name: 'newWithdrawFeeBps', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setFees(calldata: Calldata): BytesWriter {
        const newCompoundFeeBps: u256 = calldata.readU256();
        const newWithdrawFeeBps: u256 = calldata.readU256();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        this.assertOwner();

        if (u256.gt(newCompoundFeeBps, MAX_COMPOUND_FEE_BPS)) {
            throw new Revert('Compound fee too high');
        }
        if (u256.gt(newWithdrawFeeBps, MAX_WITHDRAW_FEE_BPS)) {
            throw new Revert('Withdraw fee too high');
        }

        this.compoundFeeBpsStore.value = newCompoundFeeBps;
        this.withdrawFeeBpsStore.value = newWithdrawFeeBps;

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method({ name: 'recipient', type: ABIDataTypes.EXTENDED_ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setFeeRecipient(calldata: Calldata): BytesWriter {
        const recipientExt: ExtendedAddress = calldata.readExtendedAddress();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        this.assertOwner();

        this.feeRecipientStore.value = addressToU256(recipientExt);
        this.feeRecipientTweakedStore.value = u256.fromUint8ArrayBE(recipientExt.tweakedPublicKey);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── Read Methods ─────────────────────────────────────────────────────────

    @method({ name: 'token', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'totalStaked', type: ABIDataTypes.UINT256 },
        { name: 'totalShares', type: ABIDataTypes.UINT256 },
        { name: 'rewardRate', type: ABIDataTypes.UINT256 },
        { name: 'lastCompoundBlock', type: ABIDataTypes.UINT256 },
        { name: 'rewardPool', type: ABIDataTypes.UINT256 },
        { name: 'compoundFeeBps', type: ABIDataTypes.UINT256 },
        { name: 'withdrawFeeBps', type: ABIDataTypes.UINT256 },
    )
    public getVaultInfo(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const tokenKey: u256 = addressToU256(token);

        const writer: BytesWriter = new BytesWriter(VAULT_INFO_SIZE);
        writer.writeU256(this.totalStakedMap.get(tokenKey));
        writer.writeU256(this.totalSharesMap.get(tokenKey));
        writer.writeU256(this.rewardRateMap.get(tokenKey));
        writer.writeU256(this.lastCompoundBlockMap.get(tokenKey));
        writer.writeU256(this.rewardPoolMap.get(tokenKey));
        writer.writeU256(this.compoundFeeBpsStore.value);
        writer.writeU256(this.withdrawFeeBpsStore.value);
        return writer;
    }

    @method(
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'user', type: ABIDataTypes.ADDRESS },
    )
    @returns(
        { name: 'shares', type: ABIDataTypes.UINT256 },
        { name: 'stakedEquivalent', type: ABIDataTypes.UINT256 },
        { name: 'pendingRewardShare', type: ABIDataTypes.UINT256 },
    )
    public getUserInfo(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const user: Address = calldata.readAddress();

        const tokenKey: u256 = addressToU256(token);
        const userKey: u256 = this.getUserSharesKey(token, user);
        const shares: u256 = this.userSharesMap.get(userKey);
        const totalStaked: u256 = this.totalStakedMap.get(tokenKey);
        const totalShares: u256 = this.totalSharesMap.get(tokenKey);

        let stakedEquivalent: u256 = ZERO;
        let pendingRewardShare: u256 = ZERO;

        if (u256.gt(totalShares, ZERO) && u256.gt(shares, ZERO)) {
            stakedEquivalent = SafeMath.div(SafeMath.mul(shares, totalStaked), totalShares);

            // Calculate user's share of pending rewards
            const pending: u256 = this.computePendingRewards(tokenKey);
            if (u256.gt(pending, ZERO)) {
                pendingRewardShare = SafeMath.div(SafeMath.mul(pending, shares), totalShares);
            }
        }

        const writer: BytesWriter = new BytesWriter(USER_INFO_SIZE);
        writer.writeU256(shares);
        writer.writeU256(stakedEquivalent);
        writer.writeU256(pendingRewardShare);
        return writer;
    }

    @method({ name: 'token', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'pricePerShare', type: ABIDataTypes.UINT256 })
    public getSharePrice(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const tokenKey: u256 = addressToU256(token);
        const totalStaked: u256 = this.totalStakedMap.get(tokenKey);
        const totalShares: u256 = this.totalSharesMap.get(tokenKey);

        let pricePerShare: u256;
        if (u256.eq(totalShares, ZERO)) {
            pricePerShare = ONE_E18;
        } else {
            pricePerShare = SafeMath.div(SafeMath.mul(totalStaked, ONE_E18), totalShares);
        }

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(pricePerShare);
        return writer;
    }

    @method({ name: 'token', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'pending', type: ABIDataTypes.UINT256 })
    public getPendingRewards(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const tokenKey: u256 = addressToU256(token);

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this.computePendingRewards(tokenKey));
        return writer;
    }

    @method()
    @returns(
        { name: 'compoundFeeBps', type: ABIDataTypes.UINT256 },
        { name: 'withdrawFeeBps', type: ABIDataTypes.UINT256 },
        { name: 'feeRecipient', type: ABIDataTypes.EXTENDED_ADDRESS },
        { name: 'totalFeesCollectedMoto', type: ABIDataTypes.UINT256 },
        { name: 'totalFeesCollectedPill', type: ABIDataTypes.UINT256 },
    )
    public getFeeInfo(_calldata: Calldata): BytesWriter {
        // Reconstruct feeRecipient ExtendedAddress
        const tweaked: Uint8Array = this.feeRecipientTweakedStore.value.toUint8Array(true);
        const mldsa: Uint8Array = this.feeRecipientStore.value.toUint8Array(true);
        const combined = new Uint8Array(EXTENDED_ADDRESS_BYTE_LENGTH);
        combined.set(tweaked, 0);
        combined.set(mldsa, 32);
        const feeRecipientExt: ExtendedAddress = ExtendedAddress.fromUint8Array(combined);

        const writer: BytesWriter = new BytesWriter(FEE_INFO_SIZE);
        writer.writeU256(this.compoundFeeBpsStore.value);
        writer.writeU256(this.withdrawFeeBpsStore.value);
        writer.writeExtendedAddress(feeRecipientExt);
        writer.writeU256(this.totalFeesCollectedMap.get(ZERO));  // placeholder slot for MOTO
        writer.writeU256(this.totalFeesCollectedMap.get(ONE));   // placeholder slot for PILL
        return writer;
    }

    @method({ name: 'token', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'totalFees', type: ABIDataTypes.UINT256 })
    public getTotalFeesCollected(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const tokenKey: u256 = addressToU256(token);

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this.totalFeesCollectedMap.get(tokenKey));
        return writer;
    }

    // ── Private Helpers ──────────────────────────────────────────────────────

    private getUserSharesKey(token: Address, user: Address): u256 {
        const combined = new Uint8Array(ADDRESS_BYTE_LENGTH * 2);
        combined.set(token, 0);
        combined.set(user, ADDRESS_BYTE_LENGTH);
        const hash: Uint8Array = Blockchain.sha256(combined);
        return u256.fromUint8ArrayBE(hash);
    }

    private computePendingRewards(tokenKey: u256): u256 {
        const rewardRate: u256 = this.rewardRateMap.get(tokenKey);
        const lastCompoundBlock: u256 = this.lastCompoundBlockMap.get(tokenKey);
        const currentBlock: u256 = u256.fromU64(<u64>Blockchain.block.number);
        const rewardPool: u256 = this.rewardPoolMap.get(tokenKey);

        if (u256.le(currentBlock, lastCompoundBlock)) return ZERO;
        if (u256.eq(rewardRate, ZERO)) return ZERO;

        const blockDiff: u256 = SafeMath.sub(currentBlock, lastCompoundBlock);
        let pending: u256 = SafeMath.mul(blockDiff, rewardRate);

        if (u256.gt(pending, rewardPool)) {
            pending = rewardPool;
        }

        return pending;
    }

    /**
     * Internal compound used by setRewardRate to flush pending rewards before rate change.
     * Does NOT require reentrancy guard (caller already holds lock).
     */
    private internalCompound(tokenKey: u256, token: Address): void {
        const totalStaked: u256 = this.totalStakedMap.get(tokenKey);
        if (u256.eq(totalStaked, ZERO)) return;

        const pending: u256 = this.computePendingRewards(tokenKey);
        if (u256.eq(pending, ZERO)) return;

        const compoundFeeBps: u256 = this.compoundFeeBpsStore.value;
        const fee: u256 = SafeMath.div(SafeMath.mul(pending, compoundFeeBps), BPS_BASE);
        const netRewards: u256 = SafeMath.sub(pending, fee);

        const currentBlock: u256 = u256.fromU64(<u64>Blockchain.block.number);
        const rewardPool: u256 = this.rewardPoolMap.get(tokenKey);

        this.lastCompoundBlockMap.set(tokenKey, currentBlock);
        this.rewardPoolMap.set(tokenKey, SafeMath.sub(rewardPool, pending));
        this.totalStakedMap.set(tokenKey, SafeMath.add(totalStaked, netRewards));

        if (u256.gt(fee, ZERO)) {
            const currentFees: u256 = this.totalFeesCollectedMap.get(tokenKey);
            this.totalFeesCollectedMap.set(tokenKey, SafeMath.add(currentFees, fee));
            const feeRecipient: Address = u256ToAddress(this.feeRecipientStore.value);
            this.op20Transfer(token, feeRecipient, fee);
        }
    }

    private assertNotLocked(): void {
        if (this.locked.value) throw new Revert('Reentrancy guard');
    }

    private assertOwner(): void {
        const deployer: Address = u256ToAddress(this.deployerStore.value);
        if (!deployer.equals(Blockchain.tx.sender)) {
            throw new Revert('Only owner');
        }
    }

    private op20TransferFrom(token: Address, from: Address, to: Address, amount: u256): void {
        const writer: BytesWriter = new BytesWriter(4 + ADDRESS_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + 32);
        writer.writeSelector(SEL_TRANSFER_FROM);
        writer.writeAddress(from);
        writer.writeAddress(to);
        writer.writeU256(amount);
        Blockchain.call(token, writer);
    }

    private op20Transfer(token: Address, to: Address, amount: u256): void {
        const writer: BytesWriter = new BytesWriter(4 + ADDRESS_BYTE_LENGTH + 32);
        writer.writeSelector(SEL_TRANSFER);
        writer.writeAddress(to);
        writer.writeU256(amount);
        Blockchain.call(token, writer);
    }
}
