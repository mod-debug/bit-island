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

// ── Offer status constants ──────────────────────────────────────────────────
const STATUS_ACTIVE: u256 = u256.fromU32(0);
const STATUS_ACCEPTED: u256 = u256.fromU32(1);
const STATUS_CANCELLED: u256 = u256.fromU32(2);

// ── OP-20 method selectors ──────────────────────────────────────────────────
const SEL_TRANSFER: u32 = encodeSelector('transfer(address,uint256)');
const SEL_TRANSFER_FROM: u32 = encodeSelector('transferFrom(address,address,uint256)');

// ── Offer response size ─────────────────────────────────────────────────────
// creator(64) + acceptor(64) + offeredToken(32) + offeredAmount(32) + wantedToken(32) + wantedAmount(32) + status(1) + createdAt(4)
const OFFER_RESPONSE_SIZE: i32 =
    EXTENDED_ADDRESS_BYTE_LENGTH + EXTENDED_ADDRESS_BYTE_LENGTH +
    ADDRESS_BYTE_LENGTH + 32 +
    ADDRESS_BYTE_LENGTH + 32 + 1 + 4;

// ── Helper: u256 → Address ─────────────────────────────────────────────────
function u256ToAddress(val: u256): Address {
    return Address.fromUint8Array(val.toUint8Array(true));
}

// ── Helper: Address → u256 ─────────────────────────────────────────────────
function addressToU256(addr: Address): u256 {
    return u256.fromUint8ArrayBE(addr);
}

/**
 * OTC Escrow Contract — Monkey Island Trading Post
 *
 * Trustless peer-to-peer OP-20 token swaps on Bitcoin L1.
 *
 * Flow:
 *   1. Creator approves this contract on offeredToken, then calls createOffer()
 *   2. Acceptor approves this contract on wantedToken, then calls acceptOffer()
 *   3. Creator can cancelOffer() if not yet accepted
 */
@final
export class OTCEscrow extends OP_NET {
    // ── Storage pointer declarations (constructor only) ─────────────────────
    // ORDER IS SACRED — never reorder after deployment

    private readonly lockedPtr: u16 = Blockchain.nextPointer;
    private readonly counterPtr: u16 = Blockchain.nextPointer;

    // Creator stored as EXTENDED_ADDRESS (tweaked key + MLDSA hash)
    private readonly creatorPtr: u16 = Blockchain.nextPointer;
    private readonly creatorTweakedPtr: u16 = Blockchain.nextPointer;

    // Tokens stored as ADDRESS (32 bytes — correct round-trip for P2OP display)
    private readonly offeredTokenPtr: u16 = Blockchain.nextPointer;
    private readonly wantedTokenPtr: u16 = Blockchain.nextPointer;

    private readonly offeredAmountPtr: u16 = Blockchain.nextPointer;
    private readonly wantedAmountPtr: u16 = Blockchain.nextPointer;
    private readonly statusPtr: u16 = Blockchain.nextPointer;
    private readonly createdAtPtr: u16 = Blockchain.nextPointer;

    // Acceptor stored as EXTENDED_ADDRESS (tweaked key + MLDSA hash) — set on accept
    private readonly acceptorPtr: u16 = Blockchain.nextPointer;
    private readonly acceptorTweakedPtr: u16 = Blockchain.nextPointer;

    // ── Storage instances ───────────────────────────────────────────────────
    private readonly locked: StoredBoolean = new StoredBoolean(this.lockedPtr, false);
    private readonly counter: StoredU256 = new StoredU256(this.counterPtr, new Uint8Array(30));

    private readonly creatorMap: StoredMapU256 = new StoredMapU256(this.creatorPtr);
    private readonly creatorTweakedMap: StoredMapU256 = new StoredMapU256(this.creatorTweakedPtr);

    private readonly offeredTokenMap: StoredMapU256 = new StoredMapU256(this.offeredTokenPtr);
    private readonly wantedTokenMap: StoredMapU256 = new StoredMapU256(this.wantedTokenPtr);

    private readonly offeredAmountMap: StoredMapU256 = new StoredMapU256(this.offeredAmountPtr);
    private readonly wantedAmountMap: StoredMapU256 = new StoredMapU256(this.wantedAmountPtr);
    private readonly statusMap: StoredMapU256 = new StoredMapU256(this.statusPtr);
    private readonly createdAtMap: StoredMapU256 = new StoredMapU256(this.createdAtPtr);

    private readonly acceptorMap: StoredMapU256 = new StoredMapU256(this.acceptorPtr);
    private readonly acceptorTweakedMap: StoredMapU256 = new StoredMapU256(this.acceptorTweakedPtr);

    public constructor() {
        super();
    }

    // ── Write Methods ───────────────────────────────────────────────────────

    @method(
        { name: 'offeredToken', type: ABIDataTypes.ADDRESS },
        { name: 'offeredAmount', type: ABIDataTypes.UINT256 },
        { name: 'wantedToken', type: ABIDataTypes.ADDRESS },
        { name: 'wantedAmount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'offerId', type: ABIDataTypes.UINT256 })
    public createOffer(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const offeredToken: Address = calldata.readAddress();
        const offeredAmount: u256 = calldata.readU256();
        const wantedToken: Address = calldata.readAddress();
        const wantedAmount: u256 = calldata.readU256();

        const creator: ExtendedAddress = Blockchain.tx.origin;

        // Validate inputs
        if (u256.eq(offeredAmount, u256.Zero)) throw new Revert('Offered amount must be > 0');
        if (u256.eq(wantedAmount, u256.Zero)) throw new Revert('Wanted amount must be > 0');

        // Block contract-to-contract calls
        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        this.op20TransferFrom(offeredToken, Blockchain.tx.sender, this.address, offeredAmount);

        const offerId: u256 = this.counter.value;
        const nextId: u256 = SafeMath.add(offerId, u256.One);
        this.counter.value = nextId;

        // Store creator as EXTENDED_ADDRESS (MLDSA hash + tweaked key)
        this.creatorMap.set(offerId, addressToU256(Blockchain.tx.sender));
        this.creatorTweakedMap.set(offerId, u256.fromUint8ArrayBE(creator.tweakedPublicKey));

        // Store tokens as ADDRESS (32 bytes — round-trip safe for P2OP)
        this.offeredTokenMap.set(offerId, addressToU256(offeredToken));
        this.wantedTokenMap.set(offerId, addressToU256(wantedToken));

        this.offeredAmountMap.set(offerId, offeredAmount);
        this.wantedAmountMap.set(offerId, wantedAmount);
        this.statusMap.set(offerId, STATUS_ACTIVE);
        this.createdAtMap.set(offerId, u256.fromU32(<u32>Blockchain.block.number));

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(offerId);
        return writer;
    }

    @method({ name: 'offerId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public acceptOffer(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const offerId: u256 = calldata.readU256();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        this.assertOfferExists(offerId);
        this.assertOfferActive(offerId);

        const creator: Address = u256ToAddress(this.creatorMap.get(offerId));
        const offeredToken: Address = u256ToAddress(this.offeredTokenMap.get(offerId));
        const offeredAmount: u256 = this.offeredAmountMap.get(offerId);
        const wantedToken: Address = u256ToAddress(this.wantedTokenMap.get(offerId));
        const wantedAmount: u256 = this.wantedAmountMap.get(offerId);

        if (creator.equals(Blockchain.tx.sender)) throw new Revert('Cannot accept own offer');

        this.statusMap.set(offerId, STATUS_ACCEPTED);

        // Store acceptor (buyer) address
        const acceptor: ExtendedAddress = Blockchain.tx.origin;
        this.acceptorMap.set(offerId, addressToU256(Blockchain.tx.sender));
        this.acceptorTweakedMap.set(offerId, u256.fromUint8ArrayBE(acceptor.tweakedPublicKey));

        this.op20TransferFrom(wantedToken, Blockchain.tx.sender, this.address, wantedAmount);
        this.op20Transfer(wantedToken, creator, wantedAmount);
        this.op20Transfer(offeredToken, Blockchain.tx.sender, offeredAmount);

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method({ name: 'offerId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public cancelOffer(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const offerId: u256 = calldata.readU256();

        this.assertOfferExists(offerId);
        this.assertOfferActive(offerId);

        const creator: Address = u256ToAddress(this.creatorMap.get(offerId));
        if (!creator.equals(Blockchain.tx.sender)) throw new Revert('Only creator can cancel');

        const offeredToken: Address = u256ToAddress(this.offeredTokenMap.get(offerId));
        const offeredAmount: u256 = this.offeredAmountMap.get(offerId);

        this.statusMap.set(offerId, STATUS_CANCELLED);
        this.op20Transfer(offeredToken, creator, offeredAmount);

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── Read Methods ─────────────────────────────────────────────────────────

    @method({ name: 'offerId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'creator', type: ABIDataTypes.EXTENDED_ADDRESS },
        { name: 'acceptor', type: ABIDataTypes.EXTENDED_ADDRESS },
        { name: 'offeredToken', type: ABIDataTypes.ADDRESS },
        { name: 'offeredAmount', type: ABIDataTypes.UINT256 },
        { name: 'wantedToken', type: ABIDataTypes.ADDRESS },
        { name: 'wantedAmount', type: ABIDataTypes.UINT256 },
        { name: 'status', type: ABIDataTypes.UINT8 },
        { name: 'createdAt', type: ABIDataTypes.UINT32 },
    )
    public getOffer(calldata: Calldata): BytesWriter {
        const offerId: u256 = calldata.readU256();
        this.assertOfferExists(offerId);

        // Reconstruct creator ExtendedAddress
        const tweakedBytes: Uint8Array = this.creatorTweakedMap.get(offerId).toUint8Array(true);
        const mldsaBytes: Uint8Array = this.creatorMap.get(offerId).toUint8Array(true);
        const combined = new Uint8Array(EXTENDED_ADDRESS_BYTE_LENGTH);
        combined.set(tweakedBytes, 0);
        combined.set(mldsaBytes, 32);
        const creator: ExtendedAddress = ExtendedAddress.fromUint8Array(combined);

        // Reconstruct acceptor ExtendedAddress (zero if not accepted)
        const accTweakedBytes: Uint8Array = this.acceptorTweakedMap.get(offerId).toUint8Array(true);
        const accMldsaBytes: Uint8Array = this.acceptorMap.get(offerId).toUint8Array(true);
        const accCombined = new Uint8Array(EXTENDED_ADDRESS_BYTE_LENGTH);
        accCombined.set(accTweakedBytes, 0);
        accCombined.set(accMldsaBytes, 32);
        const acceptor: ExtendedAddress = ExtendedAddress.fromUint8Array(accCombined);

        const offeredToken: Address = u256ToAddress(this.offeredTokenMap.get(offerId));
        const wantedToken: Address = u256ToAddress(this.wantedTokenMap.get(offerId));
        const offeredAmount: u256 = this.offeredAmountMap.get(offerId);
        const wantedAmount: u256 = this.wantedAmountMap.get(offerId);
        const status: u256 = this.statusMap.get(offerId);
        const createdAt: u256 = this.createdAtMap.get(offerId);

        const writer: BytesWriter = new BytesWriter(OFFER_RESPONSE_SIZE);
        writer.writeExtendedAddress(creator);
        writer.writeExtendedAddress(acceptor);
        writer.writeAddress(offeredToken);
        writer.writeU256(offeredAmount);
        writer.writeAddress(wantedToken);
        writer.writeU256(wantedAmount);
        writer.writeU8(<u8>status.toU32());
        writer.writeU32(<u32>createdAt.toU64());
        return writer;
    }

    @method()
    @returns({ name: 'nextId', type: ABIDataTypes.UINT256 })
    public getNextOfferId(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this.counter.value);
        return writer;
    }

    // ── Private Helpers ──────────────────────────────────────────────────────

    private assertNotLocked(): void {
        if (this.locked.value) throw new Revert('Reentrancy guard');
    }

    private assertOfferExists(offerId: u256): void {
        if (u256.ge(offerId, this.counter.value)) throw new Revert('Offer does not exist');
    }

    private assertOfferActive(offerId: u256): void {
        if (!u256.eq(this.statusMap.get(offerId), STATUS_ACTIVE)) {
            throw new Revert('Offer is not active');
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
