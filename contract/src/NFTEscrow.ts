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

// ── Offer type constants ────────────────────────────────────────────────────
const TYPE_NFT_FOR_NFT: u256 = u256.fromU32(0);
const TYPE_NFT_FOR_TOKEN: u256 = u256.fromU32(1);
const TYPE_TOKEN_FOR_NFT: u256 = u256.fromU32(2);

// ── Offer status constants ──────────────────────────────────────────────────
const STATUS_ACTIVE: u256 = u256.fromU32(0);
const STATUS_ACCEPTED: u256 = u256.fromU32(1);
const STATUS_CANCELLED: u256 = u256.fromU32(2);

// ── Method selectors ────────────────────────────────────────────────────────
const SEL_TRANSFER: u32 = encodeSelector('transfer(address,uint256)');
const SEL_TRANSFER_FROM: u32 = encodeSelector('transferFrom(address,address,uint256)');

// ── Response size for getOffer ──────────────────────────────────────────────
// offerType(1) + status(1) + createdAt(4)
// + creator(64) + acceptor(64)
// + offeredCollection(32) + offeredTokenId(32) + offeredAmount(32)
// + wantedCollection(32) + wantedTokenId(32) + wantedAmount(32)
// + acceptorTokenId(32)
const OFFER_RESPONSE_SIZE: i32 =
    1 + 1 + 4 +
    EXTENDED_ADDRESS_BYTE_LENGTH + EXTENDED_ADDRESS_BYTE_LENGTH +
    ADDRESS_BYTE_LENGTH + 32 + 32 +
    ADDRESS_BYTE_LENGTH + 32 + 32 +
    32;

// ── Helper: u256 -> Address ─────────────────────────────────────────────────
function u256ToAddress(val: u256): Address {
    return Address.fromUint8Array(val.toUint8Array(true));
}

// ── Helper: Address -> u256 ─────────────────────────────────────────────────
function addressToU256(addr: Address): u256 {
    return u256.fromUint8ArrayBE(addr);
}

/**
 * NFT Escrow Contract — Monkey Island Trading Post
 *
 * Trustless peer-to-peer NFT and token swaps on Bitcoin L1.
 *
 * Offer types:
 *   0 = NFT for NFT
 *   1 = NFT for Token (offerer gives NFT, wants OP-20 tokens)
 *   2 = Token for NFT (offerer gives OP-20 tokens, wants NFT)
 *
 * Flow:
 *   1. Creator approves this contract, then calls createOffer()
 *   2. Acceptor approves this contract, then calls acceptOffer()
 *   3. Creator can cancelOffer() if not yet accepted
 */
@final
export class NFTEscrow extends OP_NET {
    // ── Storage pointer declarations (constructor only) ─────────────────────
    // ORDER IS SACRED — never reorder after deployment

    private readonly lockedPtr: u16 = Blockchain.nextPointer;
    private readonly counterPtr: u16 = Blockchain.nextPointer;

    private readonly offerTypePtr: u16 = Blockchain.nextPointer;
    private readonly statusPtr: u16 = Blockchain.nextPointer;
    private readonly createdAtPtr: u16 = Blockchain.nextPointer;

    // Creator as ExtendedAddress (2 maps: MLDSA hash + tweaked key)
    private readonly creatorPtr: u16 = Blockchain.nextPointer;
    private readonly creatorTweakedPtr: u16 = Blockchain.nextPointer;

    private readonly offeredCollectionPtr: u16 = Blockchain.nextPointer;
    private readonly offeredTokenIdPtr: u16 = Blockchain.nextPointer;
    private readonly offeredAmountPtr: u16 = Blockchain.nextPointer;

    private readonly wantedCollectionPtr: u16 = Blockchain.nextPointer;
    private readonly wantedTokenIdPtr: u16 = Blockchain.nextPointer;
    private readonly wantedAmountPtr: u16 = Blockchain.nextPointer;

    // Acceptor as ExtendedAddress (2 maps)
    private readonly acceptorPtr: u16 = Blockchain.nextPointer;
    private readonly acceptorTweakedPtr: u16 = Blockchain.nextPointer;

    // The tokenId the acceptor actually provided (for "any from collection" offers)
    private readonly acceptorTokenIdPtr: u16 = Blockchain.nextPointer;

    // ── Storage instances ───────────────────────────────────────────────────
    private readonly locked: StoredBoolean = new StoredBoolean(this.lockedPtr, false);
    private readonly counter: StoredU256 = new StoredU256(this.counterPtr, new Uint8Array(30));

    private readonly offerTypeMap: StoredMapU256 = new StoredMapU256(this.offerTypePtr);
    private readonly statusMap: StoredMapU256 = new StoredMapU256(this.statusPtr);
    private readonly createdAtMap: StoredMapU256 = new StoredMapU256(this.createdAtPtr);

    private readonly creatorMap: StoredMapU256 = new StoredMapU256(this.creatorPtr);
    private readonly creatorTweakedMap: StoredMapU256 = new StoredMapU256(this.creatorTweakedPtr);

    private readonly offeredCollectionMap: StoredMapU256 = new StoredMapU256(this.offeredCollectionPtr);
    private readonly offeredTokenIdMap: StoredMapU256 = new StoredMapU256(this.offeredTokenIdPtr);
    private readonly offeredAmountMap: StoredMapU256 = new StoredMapU256(this.offeredAmountPtr);

    private readonly wantedCollectionMap: StoredMapU256 = new StoredMapU256(this.wantedCollectionPtr);
    private readonly wantedTokenIdMap: StoredMapU256 = new StoredMapU256(this.wantedTokenIdPtr);
    private readonly wantedAmountMap: StoredMapU256 = new StoredMapU256(this.wantedAmountPtr);

    private readonly acceptorMap: StoredMapU256 = new StoredMapU256(this.acceptorPtr);
    private readonly acceptorTweakedMap: StoredMapU256 = new StoredMapU256(this.acceptorTweakedPtr);

    private readonly acceptorTokenIdMap: StoredMapU256 = new StoredMapU256(this.acceptorTokenIdPtr);

    public constructor() {
        super();
    }

    // ── Write Methods ───────────────────────────────────────────────────────

    @method(
        { name: 'offerType', type: ABIDataTypes.UINT8 },
        { name: 'offeredCollection', type: ABIDataTypes.ADDRESS },
        { name: 'offeredTokenId', type: ABIDataTypes.UINT256 },
        { name: 'offeredAmount', type: ABIDataTypes.UINT256 },
        { name: 'wantedCollection', type: ABIDataTypes.ADDRESS },
        { name: 'wantedTokenId', type: ABIDataTypes.UINT256 },
        { name: 'wantedAmount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'offerId', type: ABIDataTypes.UINT256 })
    public createOffer(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const offerType: u256 = u256.fromU32(<u32>calldata.readU8());
        const offeredCollection: Address = calldata.readAddress();
        const offeredTokenId: u256 = calldata.readU256();
        const offeredAmount: u256 = calldata.readU256();
        const wantedCollection: Address = calldata.readAddress();
        const wantedTokenId: u256 = calldata.readU256();
        const wantedAmount: u256 = calldata.readU256();

        // Block contract-to-contract calls
        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        // Validate offer type
        if (u256.gt(offerType, TYPE_TOKEN_FOR_NFT)) {
            throw new Revert('Invalid offer type');
        }

        // Pull the offered asset from the creator
        if (u256.eq(offerType, TYPE_NFT_FOR_NFT) || u256.eq(offerType, TYPE_NFT_FOR_TOKEN)) {
            // Offerer gives an NFT
            this.nftTransferFrom(offeredCollection, Blockchain.tx.sender, this.address, offeredTokenId);
        } else {
            // TYPE_TOKEN_FOR_NFT: Offerer gives OP-20 tokens
            if (u256.eq(offeredAmount, u256.Zero)) throw new Revert('Offered amount must be > 0');
            this.op20TransferFrom(offeredCollection, Blockchain.tx.sender, this.address, offeredAmount);
        }

        // Validate wanted side
        if (u256.eq(offerType, TYPE_NFT_FOR_NFT) || u256.eq(offerType, TYPE_TOKEN_FOR_NFT)) {
            // Want an NFT — wantedTokenId 0 means "any from collection"
        } else {
            // TYPE_NFT_FOR_TOKEN: Want OP-20 tokens
            if (u256.eq(wantedAmount, u256.Zero)) throw new Revert('Wanted amount must be > 0');
        }

        const offerId: u256 = this.counter.value;
        const nextId: u256 = SafeMath.add(offerId, u256.One);
        this.counter.value = nextId;

        const creator: ExtendedAddress = Blockchain.tx.origin;

        // Store all offer data
        this.offerTypeMap.set(offerId, offerType);
        this.statusMap.set(offerId, STATUS_ACTIVE);
        this.createdAtMap.set(offerId, u256.fromU32(<u32>Blockchain.block.number));

        this.creatorMap.set(offerId, addressToU256(Blockchain.tx.sender));
        this.creatorTweakedMap.set(offerId, u256.fromUint8ArrayBE(creator.tweakedPublicKey));

        this.offeredCollectionMap.set(offerId, addressToU256(offeredCollection));
        this.offeredTokenIdMap.set(offerId, offeredTokenId);
        this.offeredAmountMap.set(offerId, offeredAmount);

        this.wantedCollectionMap.set(offerId, addressToU256(wantedCollection));
        this.wantedTokenIdMap.set(offerId, wantedTokenId);
        this.wantedAmountMap.set(offerId, wantedAmount);

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(offerId);
        return writer;
    }

    @method(
        { name: 'offerId', type: ABIDataTypes.UINT256 },
        { name: 'acceptorTokenId', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public acceptOffer(calldata: Calldata): BytesWriter {
        this.assertNotLocked();
        this.locked.value = true;

        const offerId: u256 = calldata.readU256();
        const acceptorTokenId: u256 = calldata.readU256();

        if (!Blockchain.tx.sender.equals(Blockchain.tx.origin)) {
            throw new Revert('Direct calls only');
        }

        this.assertOfferExists(offerId);
        this.assertOfferActive(offerId);

        const creator: Address = u256ToAddress(this.creatorMap.get(offerId));
        if (creator.equals(Blockchain.tx.sender)) throw new Revert('Cannot accept own offer');

        const offerType: u256 = this.offerTypeMap.get(offerId);
        const offeredCollection: Address = u256ToAddress(this.offeredCollectionMap.get(offerId));
        const offeredTokenId: u256 = this.offeredTokenIdMap.get(offerId);
        const offeredAmount: u256 = this.offeredAmountMap.get(offerId);
        const wantedCollection: Address = u256ToAddress(this.wantedCollectionMap.get(offerId));
        const wantedTokenId: u256 = this.wantedTokenIdMap.get(offerId);
        const wantedAmount: u256 = this.wantedAmountMap.get(offerId);

        this.statusMap.set(offerId, STATUS_ACCEPTED);

        // Store acceptor
        const acceptor: ExtendedAddress = Blockchain.tx.origin;
        this.acceptorMap.set(offerId, addressToU256(Blockchain.tx.sender));
        this.acceptorTweakedMap.set(offerId, u256.fromUint8ArrayBE(acceptor.tweakedPublicKey));
        this.acceptorTokenIdMap.set(offerId, acceptorTokenId);

        if (u256.eq(offerType, TYPE_NFT_FOR_NFT)) {
            // Acceptor gives NFT, gets NFT
            // Determine which tokenId the acceptor provides
            const actualTokenId: u256 = wantedTokenId.isZero() ? acceptorTokenId : wantedTokenId;
            this.nftTransferFrom(wantedCollection, Blockchain.tx.sender, this.address, actualTokenId);
            // Distribute: creator gets wanted NFT, acceptor gets offered NFT
            this.nftTransfer(wantedCollection, creator, actualTokenId);
            this.nftTransfer(offeredCollection, Blockchain.tx.sender, offeredTokenId);
        } else if (u256.eq(offerType, TYPE_NFT_FOR_TOKEN)) {
            // Acceptor gives OP-20 tokens, gets NFT
            this.op20TransferFrom(wantedCollection, Blockchain.tx.sender, this.address, wantedAmount);
            // Distribute: creator gets tokens, acceptor gets NFT
            this.op20Transfer(wantedCollection, creator, wantedAmount);
            this.nftTransfer(offeredCollection, Blockchain.tx.sender, offeredTokenId);
        } else {
            // TYPE_TOKEN_FOR_NFT: Acceptor gives NFT, gets OP-20 tokens
            const actualTokenId: u256 = wantedTokenId.isZero() ? acceptorTokenId : wantedTokenId;
            this.nftTransferFrom(wantedCollection, Blockchain.tx.sender, this.address, actualTokenId);
            // Distribute: creator gets NFT, acceptor gets tokens
            this.nftTransfer(wantedCollection, creator, actualTokenId);
            this.op20Transfer(offeredCollection, Blockchain.tx.sender, offeredAmount);
        }

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

        const offerType: u256 = this.offerTypeMap.get(offerId);
        const offeredCollection: Address = u256ToAddress(this.offeredCollectionMap.get(offerId));
        const offeredTokenId: u256 = this.offeredTokenIdMap.get(offerId);
        const offeredAmount: u256 = this.offeredAmountMap.get(offerId);

        this.statusMap.set(offerId, STATUS_CANCELLED);

        // Return the offered asset to the creator
        if (u256.eq(offerType, TYPE_NFT_FOR_NFT) || u256.eq(offerType, TYPE_NFT_FOR_TOKEN)) {
            this.nftTransfer(offeredCollection, creator, offeredTokenId);
        } else {
            this.op20Transfer(offeredCollection, creator, offeredAmount);
        }

        this.locked.value = false;

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── Read Methods ─────────────────────────────────────────────────────────

    @method({ name: 'offerId', type: ABIDataTypes.UINT256 })
    @returns(
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

        const offerType: u256 = this.offerTypeMap.get(offerId);
        const status: u256 = this.statusMap.get(offerId);
        const createdAt: u256 = this.createdAtMap.get(offerId);
        const offeredCollection: Address = u256ToAddress(this.offeredCollectionMap.get(offerId));
        const offeredTokenId: u256 = this.offeredTokenIdMap.get(offerId);
        const offeredAmount: u256 = this.offeredAmountMap.get(offerId);
        const wantedCollection: Address = u256ToAddress(this.wantedCollectionMap.get(offerId));
        const wantedTokenId: u256 = this.wantedTokenIdMap.get(offerId);
        const wantedAmount: u256 = this.wantedAmountMap.get(offerId);
        const acceptorTokenId: u256 = this.acceptorTokenIdMap.get(offerId);

        const writer: BytesWriter = new BytesWriter(OFFER_RESPONSE_SIZE);
        writer.writeU8(<u8>offerType.toU32());
        writer.writeU8(<u8>status.toU32());
        writer.writeU32(<u32>createdAt.toU64());
        writer.writeExtendedAddress(creator);
        writer.writeExtendedAddress(acceptor);
        writer.writeAddress(offeredCollection);
        writer.writeU256(offeredTokenId);
        writer.writeU256(offeredAmount);
        writer.writeAddress(wantedCollection);
        writer.writeU256(wantedTokenId);
        writer.writeU256(wantedAmount);
        writer.writeU256(acceptorTokenId);
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

    /** OP-20 transferFrom: pull tokens from `from` to `to` */
    private op20TransferFrom(token: Address, from: Address, to: Address, amount: u256): void {
        const writer: BytesWriter = new BytesWriter(4 + ADDRESS_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + 32);
        writer.writeSelector(SEL_TRANSFER_FROM);
        writer.writeAddress(from);
        writer.writeAddress(to);
        writer.writeU256(amount);
        Blockchain.call(token, writer);
    }

    /** OP-20 transfer: send tokens from this contract to `to` */
    private op20Transfer(token: Address, to: Address, amount: u256): void {
        const writer: BytesWriter = new BytesWriter(4 + ADDRESS_BYTE_LENGTH + 32);
        writer.writeSelector(SEL_TRANSFER);
        writer.writeAddress(to);
        writer.writeU256(amount);
        Blockchain.call(token, writer);
    }

    /** OP-721 transferFrom: pull NFT from `from` to `to` */
    private nftTransferFrom(collection: Address, from: Address, to: Address, tokenId: u256): void {
        const writer: BytesWriter = new BytesWriter(4 + ADDRESS_BYTE_LENGTH + ADDRESS_BYTE_LENGTH + 32);
        writer.writeSelector(SEL_TRANSFER_FROM);
        writer.writeAddress(from);
        writer.writeAddress(to);
        writer.writeU256(tokenId);
        Blockchain.call(collection, writer);
    }

    /** OP-721 transfer: send NFT from this contract to `to` */
    private nftTransfer(collection: Address, to: Address, tokenId: u256): void {
        const writer: BytesWriter = new BytesWriter(4 + ADDRESS_BYTE_LENGTH + 32);
        writer.writeSelector(SEL_TRANSFER);
        writer.writeAddress(to);
        writer.writeU256(tokenId);
        Blockchain.call(collection, writer);
    }
}
