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

const STATUS_ACTIVE: u256 = u256.fromU32(0);
const STATUS_REVOKED: u256 = u256.fromU32(1);

const SEL_TRANSFER: u32 = encodeSelector('transfer(address,uint256)');
const SEL_TRANSFER_FROM: u32 = encodeSelector('transferFrom(address,address,uint256)');

const ZERO: u256 = u256.Zero;
const ONE: u256 = u256.One;

const VESTING_LINEAR: u256 = u256.fromU32(0);
const VESTING_STEPPED: u256 = u256.fromU32(1);

// getSchedule response size:
// creator(64) + beneficiary(64) + token(32) + totalAmount(32) + claimedAmount(32)
// + startBlock(32) + cliffBlocks(32) + durationBlocks(32) + revocable(1) + revoked(1)
// + vestingType(32) + stepsCount(32)
const SCHEDULE_RESPONSE_SIZE: i32 =
    EXTENDED_ADDRESS_BYTE_LENGTH + EXTENDED_ADDRESS_BYTE_LENGTH +
    ADDRESS_BYTE_LENGTH + 32 + 32 + 32 + 32 + 32 + 1 + 1 + 32 + 32;

function u256ToAddress(val: u256): Address {
    return Address.fromUint8Array(val.toUint8Array(true));
}

function addressToU256(addr: Address): u256 {
    return u256.fromUint8ArrayBE(addr);
}

/**
 * Vesting Vault Contract — The Banana Vault
 *
 * Linear token vesting on Bitcoin L1 with cliff support and optional revocation.
 *
 * Flow:
 *   1. Creator approves this contract on the token, then calls createSchedule()
 *   2. Beneficiary calls claim() to withdraw vested tokens
 *   3. Creator can revoke() if schedule is revocable — unvested returns to creator
 */
@final
export class VestingVault extends OP_NET {
    // ── Storage pointer declarations (constructor only) ─────────────────────
    private readonly lockedPtr: u16 = Blockchain.nextPointer;
    private readonly counterPtr: u16 = Blockchain.nextPointer;

    private readonly creatorPtr: u16 = Blockchain.nextPointer;
    private readonly creatorTweakedPtr: u16 = Blockchain.nextPointer;

    private readonly beneficiaryPtr: u16 = Blockchain.nextPointer;
    private readonly beneficiaryTweakedPtr: u16 = Blockchain.nextPointer;

    private readonly tokenPtr: u16 = Blockchain.nextPointer;
    private readonly totalAmountPtr: u16 = Blockchain.nextPointer;
    private readonly claimedAmountPtr: u16 = Blockchain.nextPointer;
    private readonly startBlockPtr: u16 = Blockchain.nextPointer;
    private readonly cliffBlocksPtr: u16 = Blockchain.nextPointer;
    private readonly durationBlocksPtr: u16 = Blockchain.nextPointer;
    private readonly revocablePtr: u16 = Blockchain.nextPointer;
    private readonly revokedPtr: u16 = Blockchain.nextPointer;
    private readonly lastClaimBlockPtr: u16 = Blockchain.nextPointer;
    private readonly vestingTypePtr: u16 = Blockchain.nextPointer;
    private readonly stepsCountPtr: u16 = Blockchain.nextPointer;

    // ── Storage instances ───────────────────────────────────────────────────
    private readonly locked: StoredBoolean = new StoredBoolean(this.lockedPtr, false);
    private readonly counter: StoredU256 = new StoredU256(this.counterPtr, new Uint8Array(30));

    private readonly creatorMap: StoredMapU256 = new StoredMapU256(this.creatorPtr);
    private readonly creatorTweakedMap: StoredMapU256 = new StoredMapU256(this.creatorTweakedPtr);

    private readonly beneficiaryMap: StoredMapU256 = new StoredMapU256(this.beneficiaryPtr);
    private readonly beneficiaryTweakedMap: StoredMapU256 = new StoredMapU256(this.beneficiaryTweakedPtr);

    private readonly tokenMap: StoredMapU256 = new StoredMapU256(this.tokenPtr);
    private readonly totalAmountMap: StoredMapU256 = new StoredMapU256(this.totalAmountPtr);
    private readonly claimedAmountMap: StoredMapU256 = new StoredMapU256(this.claimedAmountPtr);
    private readonly startBlockMap: StoredMapU256 = new StoredMapU256(this.startBlockPtr);
    private readonly cliffBlocksMap: StoredMapU256 = new StoredMapU256(this.cliffBlocksPtr);
    private readonly durationBlocksMap: StoredMapU256 = new StoredMapU256(this.durationBlocksPtr);
    private readonly revocableMap: StoredMapU256 = new StoredMapU256(this.revocablePtr);
    private readonly revokedMap: StoredMapU256 = new StoredMapU256(this.revokedPtr);
    private readonly lastClaimBlockMap: StoredMapU256 = new StoredMapU256(this.lastClaimBlockPtr);
    private readonly vestingTypeMap: StoredMapU256 = new StoredMapU256(this.vestingTypePtr);
    private readonly stepsCountMap: StoredMapU256 = new StoredMapU256(this.stepsCountPtr);

    public constructor() {
        super();
    }

    // ── Write Methods ───────────────────────────────────────────────────────

    @method(
        { name: 'beneficiary', type: ABIDataTypes.EXTENDED_ADDRESS },
        { name: 'token', type: ABIDataTypes.ADDRESS },
        { name: 'totalAmount', type: ABIDataTypes.UINT256 },
        { name: 'cliffBlocks', type: ABIDataTypes.UINT256 },
        { name: 'durationBlocks', type: ABIDataTypes.UINT256 },
        { name: 'revocable', type: ABIDataTypes.BOOL },
        { name: 'vestingType', type: ABIDataTypes.UINT256 },
        { name: 'stepsCount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    public createSchedule(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const beneficiaryExt: ExtendedAddress = calldata.readExtendedAddress();
        const token: Address = calldata.readAddress();
        const totalAmount: u256 = calldata.readU256();
        const cliffBlocks: u256 = calldata.readU256();
        const durationBlocks: u256 = calldata.readU256();
        const revocable: boolean = calldata.readBoolean();
        const vestingType: u256 = calldata.readU256();
        const stepsCount: u256 = calldata.readU256();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        if (u256.eq(totalAmount, ZERO)) throw new Revert('Amount must be > 0');
        if (u256.eq(durationBlocks, ZERO)) throw new Revert('Duration must be > 0');
        if (u256.gt(cliffBlocks, durationBlocks)) throw new Revert('Cliff exceeds duration');

        // Validate vesting type: 0 = linear, 1 = stepped
        if (u256.gt(vestingType, VESTING_STEPPED)) throw new Revert('Invalid vesting type');

        // If stepped, stepsCount must be >= 1
        if (u256.eq(vestingType, VESTING_STEPPED)) {
            if (u256.eq(stepsCount, ZERO)) throw new Revert('Steps must be > 0');
        }

        this.op20TransferFrom(token, Blockchain.tx.sender, this.address, totalAmount);

        const scheduleId: u256 = this.counter.value;
        this.counter.value = SafeMath.add(scheduleId, ONE);

        const creator: ExtendedAddress = Blockchain.tx.origin;
        this.creatorMap.set(scheduleId, addressToU256(Blockchain.tx.sender));
        this.creatorTweakedMap.set(scheduleId, u256.fromUint8ArrayBE(creator.tweakedPublicKey));

        this.beneficiaryMap.set(scheduleId, addressToU256(beneficiaryExt));
        this.beneficiaryTweakedMap.set(scheduleId, u256.fromUint8ArrayBE(beneficiaryExt.tweakedPublicKey));

        this.tokenMap.set(scheduleId, addressToU256(token));
        this.totalAmountMap.set(scheduleId, totalAmount);
        this.claimedAmountMap.set(scheduleId, ZERO);
        this.startBlockMap.set(scheduleId, u256.fromU64(<u64>Blockchain.block.number));
        this.cliffBlocksMap.set(scheduleId, cliffBlocks);
        this.durationBlocksMap.set(scheduleId, durationBlocks);
        this.revocableMap.set(scheduleId, revocable ? ONE : ZERO);
        this.revokedMap.set(scheduleId, STATUS_ACTIVE);
        this.vestingTypeMap.set(scheduleId, vestingType);
        this.stepsCountMap.set(scheduleId, stepsCount);

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(scheduleId);
        return writer;
    }

    @method({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'claimed', type: ABIDataTypes.UINT256 })
    public claim(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const scheduleId: u256 = calldata.readU256();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        this.assertScheduleExists(scheduleId);

        if (u256.eq(this.revokedMap.get(scheduleId), STATUS_REVOKED)) {
            throw new Revert('Schedule is revoked');
        }

        // Prevent double-claim in the same block
        const currentBlock: u256 = u256.fromU64(<u64>Blockchain.block.number);
        const lastClaim: u256 = this.lastClaimBlockMap.get(scheduleId);
        if (u256.eq(currentBlock, lastClaim)) {
            throw new Revert('Already claimed this block');
        }

        const storedBeneficiary: Address = u256ToAddress(this.beneficiaryMap.get(scheduleId));
        if (!storedBeneficiary.equals(Blockchain.tx.sender)) {
            throw new Revert('Only beneficiary can claim');
        }

        // Update beneficiary tweaked key on first claim (so getSchedule can return full address)
        if (u256.eq(this.beneficiaryTweakedMap.get(scheduleId), ZERO)) {
            const beneficiaryExt: ExtendedAddress = Blockchain.tx.origin;
            this.beneficiaryTweakedMap.set(scheduleId, u256.fromUint8ArrayBE(beneficiaryExt.tweakedPublicKey));
        }

        const vested: u256 = this.computeVested(scheduleId);
        const alreadyClaimed: u256 = this.claimedAmountMap.get(scheduleId);
        const claimable: u256 = SafeMath.sub(vested, alreadyClaimed);

        if (u256.eq(claimable, ZERO)) throw new Revert('Nothing to claim');

        this.claimedAmountMap.set(scheduleId, SafeMath.add(alreadyClaimed, claimable));
        this.lastClaimBlockMap.set(scheduleId, currentBlock);

        const token: Address = u256ToAddress(this.tokenMap.get(scheduleId));
        this.op20Transfer(token, Blockchain.tx.sender, claimable);

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(claimable);
        return writer;
    }

    @method({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public revoke(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const scheduleId: u256 = calldata.readU256();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        this.assertScheduleExists(scheduleId);

        if (u256.eq(this.revokedMap.get(scheduleId), STATUS_REVOKED)) {
            throw new Revert('Already revoked');
        }

        if (u256.eq(this.revocableMap.get(scheduleId), ZERO)) {
            throw new Revert('Schedule is not revocable');
        }

        const creator: Address = u256ToAddress(this.creatorMap.get(scheduleId));
        if (!creator.equals(Blockchain.tx.sender)) {
            throw new Revert('Only creator can revoke');
        }

        const token: Address = u256ToAddress(this.tokenMap.get(scheduleId));
        const totalAmount: u256 = this.totalAmountMap.get(scheduleId);
        const alreadyClaimed: u256 = this.claimedAmountMap.get(scheduleId);
        const vested: u256 = this.computeVested(scheduleId);

        // Send unclaimed vested tokens to beneficiary
        const unclaimedVested: u256 = SafeMath.sub(vested, alreadyClaimed);
        if (u256.gt(unclaimedVested, ZERO)) {
            const beneficiary: Address = u256ToAddress(this.beneficiaryMap.get(scheduleId));
            this.op20Transfer(token, beneficiary, unclaimedVested);
        }

        // Send unvested remainder back to creator
        const unvested: u256 = SafeMath.sub(totalAmount, vested);
        if (u256.gt(unvested, ZERO)) {
            this.op20Transfer(token, creator, unvested);
        }

        // Update claimed to reflect vested (all vested is now "claimed" / distributed)
        this.claimedAmountMap.set(scheduleId, vested);
        this.revokedMap.set(scheduleId, STATUS_REVOKED);

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method(
        { name: 'scheduleId', type: ABIDataTypes.UINT256 },
        { name: 'newBeneficiary', type: ABIDataTypes.EXTENDED_ADDRESS },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public transferBeneficiary(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const scheduleId: u256 = calldata.readU256();
        const newBeneficiaryExt: ExtendedAddress = calldata.readExtendedAddress();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        this.assertScheduleExists(scheduleId);

        // Cannot transfer revoked schedules
        if (u256.eq(this.revokedMap.get(scheduleId), STATUS_REVOKED)) {
            throw new Revert('Schedule is revoked');
        }

        // Cannot transfer fully claimed schedules
        const totalAmount: u256 = this.totalAmountMap.get(scheduleId);
        const claimedAmount: u256 = this.claimedAmountMap.get(scheduleId);
        if (u256.ge(claimedAmount, totalAmount)) {
            throw new Revert('Schedule is fully claimed');
        }

        // Only current beneficiary can transfer
        const storedBeneficiary: Address = u256ToAddress(this.beneficiaryMap.get(scheduleId));
        if (!storedBeneficiary.equals(Blockchain.tx.sender)) {
            throw new Revert('Only beneficiary can transfer');
        }

        // Update beneficiary maps
        this.beneficiaryMap.set(scheduleId, addressToU256(newBeneficiaryExt));
        this.beneficiaryTweakedMap.set(scheduleId, u256.fromUint8ArrayBE(newBeneficiaryExt.tweakedPublicKey));

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── Read Methods ─────────────────────────────────────────────────────────

    @method({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    @returns(
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
    )
    public getSchedule(calldata: Calldata): BytesWriter {
        const scheduleId: u256 = calldata.readU256();
        this.assertScheduleExists(scheduleId);

        // Reconstruct creator ExtendedAddress
        const creatorTweaked: Uint8Array = this.creatorTweakedMap.get(scheduleId).toUint8Array(true);
        const creatorMldsa: Uint8Array = this.creatorMap.get(scheduleId).toUint8Array(true);
        const creatorCombined = new Uint8Array(EXTENDED_ADDRESS_BYTE_LENGTH);
        creatorCombined.set(creatorTweaked, 0);
        creatorCombined.set(creatorMldsa, 32);
        const creator: ExtendedAddress = ExtendedAddress.fromUint8Array(creatorCombined);

        // Reconstruct beneficiary ExtendedAddress
        const benefTweaked: Uint8Array = this.beneficiaryTweakedMap.get(scheduleId).toUint8Array(true);
        const benefMldsa: Uint8Array = this.beneficiaryMap.get(scheduleId).toUint8Array(true);
        const benefCombined = new Uint8Array(EXTENDED_ADDRESS_BYTE_LENGTH);
        benefCombined.set(benefTweaked, 0);
        benefCombined.set(benefMldsa, 32);
        const beneficiary: ExtendedAddress = ExtendedAddress.fromUint8Array(benefCombined);

        const token: Address = u256ToAddress(this.tokenMap.get(scheduleId));

        const writer: BytesWriter = new BytesWriter(SCHEDULE_RESPONSE_SIZE);
        writer.writeExtendedAddress(creator);
        writer.writeExtendedAddress(beneficiary);
        writer.writeAddress(token);
        writer.writeU256(this.totalAmountMap.get(scheduleId));
        writer.writeU256(this.claimedAmountMap.get(scheduleId));
        writer.writeU256(this.startBlockMap.get(scheduleId));
        writer.writeU256(this.cliffBlocksMap.get(scheduleId));
        writer.writeU256(this.durationBlocksMap.get(scheduleId));
        writer.writeBoolean(!u256.eq(this.revocableMap.get(scheduleId), ZERO));
        writer.writeBoolean(u256.eq(this.revokedMap.get(scheduleId), STATUS_REVOKED));
        writer.writeU256(this.vestingTypeMap.get(scheduleId));
        writer.writeU256(this.stepsCountMap.get(scheduleId));
        return writer;
    }

    @method()
    @returns({ name: 'nextId', type: ABIDataTypes.UINT256 })
    public getNextScheduleId(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this.counter.value);
        return writer;
    }

    @method({ name: 'scheduleId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'vestedAmount', type: ABIDataTypes.UINT256 })
    public getVestedAmount(calldata: Calldata): BytesWriter {
        const scheduleId: u256 = calldata.readU256();
        this.assertScheduleExists(scheduleId);

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this.computeVested(scheduleId));
        return writer;
    }

    // ── Private Helpers ──────────────────────────────────────────────────────

    private computeVested(scheduleId: u256): u256 {
        const totalAmount: u256 = this.totalAmountMap.get(scheduleId);
        const startBlock: u256 = this.startBlockMap.get(scheduleId);
        const cliffBlocks: u256 = this.cliffBlocksMap.get(scheduleId);
        const durationBlocks: u256 = this.durationBlocksMap.get(scheduleId);

        const currentBlock: u256 = u256.fromU64(<u64>Blockchain.block.number);

        // Before start
        if (u256.le(currentBlock, startBlock)) return ZERO;

        const elapsed: u256 = SafeMath.sub(currentBlock, startBlock);

        // Cliff not reached
        if (u256.lt(elapsed, cliffBlocks)) return ZERO;

        // Fully vested
        if (u256.ge(elapsed, durationBlocks)) return totalAmount;

        const vestingType: u256 = this.vestingTypeMap.get(scheduleId);

        if (u256.eq(vestingType, VESTING_STEPPED)) {
            // Stepped: tokens unlock in equal chunks at regular intervals
            const stepsCount: u256 = this.stepsCountMap.get(scheduleId);
            const stepDuration: u256 = SafeMath.div(durationBlocks, stepsCount);
            const completedSteps: u256 = SafeMath.div(elapsed, stepDuration);

            // Cap at stepsCount (safety)
            const capped: u256 = u256.gt(completedSteps, stepsCount) ? stepsCount : completedSteps;

            // vested = totalAmount * completedSteps / stepsCount
            return SafeMath.div(SafeMath.mul(totalAmount, capped), stepsCount);
        }

        // Linear: totalAmount * elapsed / durationBlocks
        return SafeMath.div(SafeMath.mul(totalAmount, elapsed), durationBlocks);
    }

    private assertNotLocked(): void {
        if (this.locked.value) throw new Revert('Reentrancy guard');
    }

    private assertScheduleExists(scheduleId: u256): void {
        if (u256.ge(scheduleId, this.counter.value)) throw new Revert('Schedule does not exist');
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
