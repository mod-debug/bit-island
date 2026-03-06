import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    OP721,
    OP721InitParameters,
    Revert,
    SafeMath,
    encodeSelector,
    ADDRESS_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';

const SEL_TRANSFER_FROM: u32 = encodeSelector('transferFrom(address,address,uint256)');

/**
 * No Smile NFT Collection — OP-721 on Bitcoin L1.
 *
 * Owner-only minting for test NFTs.
 * Extends the built-in OP721 standard from btc-runtime.
 */
@final
export class NoSmileNFT extends OP721 {
    public constructor() {
        super();
    }

    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);

        const params = new OP721InitParameters(
            'No Smile',
            'NOSML',
            '',
            u256.fromU64(10000),
            '',
            '',
            '',
            'A collection for those who never smile.',
        );

        this.instantiate(params, false);
    }

    /**
     * Mint a new NFT to the specified address.
     * Only the contract deployer can mint.
     */
    @method(
        { name: 'to', type: ABIDataTypes.ADDRESS },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public mint(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const to: Address = calldata.readAddress();
        const tokenId: u256 = calldata.readU256();

        this._mint(to, tokenId);

        // Update total supply
        this._totalSupply.value = SafeMath.add(this._totalSupply.value, u256.One);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Batch mint multiple NFTs to the specified address.
     * Only the contract deployer can mint.
     */
    @method(
        { name: 'to', type: ABIDataTypes.ADDRESS },
        { name: 'startId', type: ABIDataTypes.UINT256 },
        { name: 'count', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public batchMint(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const to: Address = calldata.readAddress();
        const startId: u256 = calldata.readU256();
        const count: u256 = calldata.readU256();

        if (count.isZero()) throw new Revert('Count must be > 0');
        if (count > u256.fromU32(50)) throw new Revert('Max 50 per batch');

        let tokenId: u256 = startId;
        const endId: u256 = SafeMath.add(startId, count);
        while (u256.lt(tokenId, endId)) {
            this._mint(to, tokenId);
            tokenId = SafeMath.add(tokenId, u256.One);
        }

        this._totalSupply.value = SafeMath.add(this._totalSupply.value, count);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }
}
