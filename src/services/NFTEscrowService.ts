import { getContract, JSONRpcProvider, OP_20_ABI } from 'opnet';
import type { IOP20Contract } from 'opnet';
import { type Network, Transaction } from '@btc-vision/bitcoin';
import type { Address } from '@btc-vision/transaction';
import { NFT_ESCROW_ABI, type INFTEscrowContract } from '../abi/NFTEscrowABI.js';
import { resolveRpcUrl } from '../config/networks.js';
import { NFT_OFFER_STATUS, type NftOffer } from '../types/index.js';

/** OP-721 ABI subset: approve(address,uint256) + transferFrom(address,address,uint256) */
import { type BitcoinInterfaceAbi, BitcoinAbiTypes, ABIDataTypes, type BaseContractProperties, type CallResult } from 'opnet';

const OP721_ABI: BitcoinInterfaceAbi = [
    {
        name: 'approve',
        inputs: [
            { name: 'operator', type: ABIDataTypes.ADDRESS },
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'ownerOf',
        inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'balanceOf',
        inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'tokenOfOwnerByIndex',
        inputs: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'index', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'name',
        inputs: [],
        outputs: [{ name: 'name', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'symbol',
        inputs: [],
        outputs: [{ name: 'symbol', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'tokenURI',
        inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'uri', type: ABIDataTypes.STRING }],
        type: BitcoinAbiTypes.Function,
    },
];

interface IOP721Contract extends BaseContractProperties {
    approve(operator: string, tokenId: bigint): Promise<CallResult<Record<string, never>>>;
    ownerOf(tokenId: bigint): Promise<CallResult<{ owner: string }>>;
    balanceOf(owner: string): Promise<CallResult<{ balance: bigint }>>;
    tokenOfOwnerByIndex(owner: string, index: bigint): Promise<CallResult<{ tokenId: bigint }>>;
    name(): Promise<CallResult<{ name: string }>>;
    symbol(): Promise<CallResult<{ symbol: string }>>;
    tokenURI(tokenId: bigint): Promise<CallResult<{ uri: string }>>;
}

/** Max offers to fetch in one batch */
const MAX_FETCH = 200;

/** Receipt shape returned by sendTransaction */
interface TxReceipt {
    readonly transactionId: string;
    readonly rawTransaction?: string;
}

/** Extract the real Bitcoin txid from a sendTransaction receipt. */
function extractBitcoinTxId(receipt: TxReceipt): string {
    if (receipt.rawTransaction != null && receipt.rawTransaction.length > 0) {
        try {
            const tx = Transaction.fromHex(receipt.rawTransaction);
            return tx.getId();
        } catch { /* fall through */ }
    }
    const str = String(receipt.transactionId).trim();
    const hex = str.startsWith('0x') ? str.slice(2) : str;
    if (!/^[0-9a-fA-F]+$/.test(hex)) return str;
    return hex.toLowerCase();
}

/**
 * Singleton service for all NFT Escrow contract interactions.
 */
export class NFTEscrowService {
    static #instance: NFTEscrowService | null = null;

    #provider: JSONRpcProvider | null = null;
    #contract: INFTEscrowContract | null = null;
    #network: Network | null = null;
    #contractAddress: string | null = null;

    readonly #collectionNameCache = new Map<string, string>();
    readonly #decimalsCache = new Map<string, number>();
    readonly #nftImageCache = new Map<string, string | null>();

    private constructor() {}

    public static getInstance(): NFTEscrowService {
        if (NFTEscrowService.#instance === null) {
            NFTEscrowService.#instance = new NFTEscrowService();
        }
        return NFTEscrowService.#instance;
    }

    /** Initialize or re-initialize when network/address/sender changes. */
    public initialize(contractAddress: string, network: Network, sender?: Address): void {
        const rpcUrl = resolveRpcUrl(network);

        if (this.#contractAddress !== contractAddress || this.#network !== network || this.#provider === null) {
            this.#provider = new JSONRpcProvider({ url: rpcUrl, network });
            this.#network = network;
            this.#contractAddress = contractAddress;
        }

        this.#contract = getContract<INFTEscrowContract>(
            contractAddress,
            NFT_ESCROW_ABI,
            this.#provider,
            network,
            sender,
        ) as INFTEscrowContract;
    }

    public reset(): void {
        this.#provider = null;
        this.#contract = null;
        this.#network = null;
        this.#contractAddress = null;
    }

    public get provider(): JSONRpcProvider | null {
        return this.#provider;
    }

    public get network(): Network | null {
        return this.#network;
    }

    public get contractAddress(): string | null {
        return this.#contractAddress;
    }

    // ── Read Operations ───────────────────────────────────────────────────────

    /** Convert an opnet Address object to a bech32 p2op string (for contracts). */
    #addrStr(val: unknown): string {
        if (typeof val === 'string') return val;
        const a = val as { p2op(n: Network): string };
        return a.p2op(this.#network!);
    }

    /** Convert an opnet Address to P2TR for user addresses. */
    #addrP2tr(val: unknown): string {
        if (typeof val === 'string') return val;
        try {
            const a = val as { p2tr(n: Network): string };
            if (typeof a.p2tr === 'function') return a.p2tr(this.#network!);
        } catch { /* fall through */ }
        return this.#addrStr(val);
    }

    /** Fetch a single NFT offer by ID. */
    public async getOffer(offerId: bigint): Promise<NftOffer | null> {
        this.#assertInitialized();
        try {
            const result = await this.#contract!.getOffer(offerId);
            if (result.revert !== undefined) {
                console.warn(`[NFTEscrow] getOffer(${offerId.toString()}) reverted:`, result.revert);
                return null;
            }
            const p = result.properties;

            const status = Number(p.status) as 0 | 1 | 2;
            let acceptorAddr = '';
            if (status === NFT_OFFER_STATUS.ACCEPTED) {
                try { acceptorAddr = this.#addrP2tr(p.acceptor); } catch { /* ignore */ }
            }

            return {
                id: offerId,
                offerType: Number(p.offerType) as 0 | 1 | 2,
                status,
                createdAt: Number(p.createdAt),
                creator: this.#addrP2tr(p.creator),
                acceptor: acceptorAddr,
                offeredCollection: this.#addrStr(p.offeredCollection),
                offeredTokenId: p.offeredTokenId,
                offeredAmount: p.offeredAmount,
                wantedCollection: this.#addrStr(p.wantedCollection),
                wantedTokenId: p.wantedTokenId,
                wantedAmount: p.wantedAmount,
                acceptorTokenId: p.acceptorTokenId,
            };
        } catch (err) {
            console.error(`[NFTEscrow] getOffer(${offerId.toString()}) error:`, err);
            return null;
        }
    }

    /** Fetch all NFT offers (up to MAX_FETCH), newest first. */
    public async getAllOffers(): Promise<NftOffer[]> {
        this.#assertInitialized();

        const countResult = await this.#contract!.getNextOfferId();
        if (countResult.revert !== undefined) return [];

        const total = countResult.properties.nextId;
        if (total === 0n) return [];

        const startId = total > BigInt(MAX_FETCH) ? total - BigInt(MAX_FETCH) : 0n;
        const ids: bigint[] = [];
        for (let i = total - 1n; i >= startId; i--) {
            ids.push(i);
        }

        const results = await Promise.all(ids.map((id) => this.getOffer(id)));
        return results.filter((o): o is NftOffer => o !== null);
    }

    /** Fetch only active NFT offers. */
    public async getActiveOffers(): Promise<NftOffer[]> {
        const all = await this.getAllOffers();
        return all.filter((o) => o.status === NFT_OFFER_STATUS.ACTIVE);
    }

    /** Resolve a collection name via on-chain metadata. */
    public async resolveCollectionName(collectionAddress: string): Promise<string> {
        const key = collectionAddress.toLowerCase();
        const cached = this.#collectionNameCache.get(key);
        if (cached !== undefined) return cached;

        if (this.#provider === null || this.#network === null) return this.#shortAddr(collectionAddress);
        try {
            const contract = getContract<IOP721Contract>(
                collectionAddress,
                OP721_ABI,
                this.#provider,
                this.#network,
            ) as IOP721Contract;
            const result = await contract.name();
            if (result.revert !== undefined) return this.#shortAddr(collectionAddress);
            const name = result.properties.name as string;
            this.#collectionNameCache.set(key, name);
            return name;
        } catch {
            return this.#shortAddr(collectionAddress);
        }
    }

    /** Resolve a collection symbol via on-chain metadata. */
    public async resolveCollectionSymbol(collectionAddress: string): Promise<string> {
        if (this.#provider === null || this.#network === null) return this.#shortAddr(collectionAddress);
        try {
            const contract = getContract<IOP721Contract>(
                collectionAddress,
                OP721_ABI,
                this.#provider,
                this.#network,
            ) as IOP721Contract;
            const result = await contract.symbol();
            if (result.revert !== undefined) return this.#shortAddr(collectionAddress);
            return result.properties.symbol as string;
        } catch {
            return this.#shortAddr(collectionAddress);
        }
    }

    /**
     * Resolve the image URL for a specific NFT.
     * 3-tier fallback: tokenURI → IPFS metadata → null (caller uses generative).
     */
    public async resolveNftImage(collectionAddress: string, tokenId: bigint): Promise<string | null> {
        const cacheKey = `${collectionAddress.toLowerCase()}:${tokenId.toString()}`;
        const cached = this.#nftImageCache.get(cacheKey);
        if (cached !== undefined) return cached;

        if (this.#provider === null || this.#network === null) return null;

        try {
            const contract = getContract<IOP721Contract>(
                collectionAddress,
                OP721_ABI,
                this.#provider,
                this.#network,
            ) as IOP721Contract;

            const result = await contract.tokenURI(tokenId);
            if (result.revert !== undefined) {
                this.#nftImageCache.set(cacheKey, null);
                return null;
            }

            let uri = result.properties.uri as string;
            if (uri.length === 0 || /^\d+$/.test(uri)) {
                // Empty or bare tokenId (e.g. "1") — no real metadata
                this.#nftImageCache.set(cacheKey, null);
                return null;
            }

            // Handle data URIs
            if (uri.startsWith('data:image/')) {
                this.#nftImageCache.set(cacheKey, uri);
                return uri;
            }
            if (uri.startsWith('data:')) {
                // Likely base64 JSON metadata
                try {
                    const b64Part = uri.split(',')[1] ?? '';
                    const json: unknown = JSON.parse(atob(b64Part));
                    if (typeof json === 'object' && json !== null) {
                        const meta = json as Record<string, unknown>;
                        const img = meta['image'] ?? meta['image_url'];
                        if (typeof img === 'string' && img.length > 0) {
                            const resolved = this.#resolveIpfsUri(img);
                            this.#nftImageCache.set(cacheKey, resolved);
                            return resolved;
                        }
                    }
                } catch { /* fall through */ }
            }

            // Convert IPFS URIs to HTTP gateway
            uri = this.#resolveIpfsUri(uri);

            // If URI is a direct image, return it
            if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(uri)) {
                this.#nftImageCache.set(cacheKey, uri);
                return uri;
            }

            // Otherwise, fetch JSON metadata with IPFS fallbacks
            const imageUrl = await this.#fetchMetadataImage(uri);
            this.#nftImageCache.set(cacheKey, imageUrl);
            return imageUrl;
        } catch {
            this.#nftImageCache.set(cacheKey, null);
            return null;
        }
    }

    /** Get the token IDs owned by an address in a given collection. */
    public async getNftOwnerTokens(collectionAddress: string, ownerAddress: string): Promise<bigint[]> {
        if (this.#provider === null || this.#network === null) return [];
        try {
            const ownerAddr = await this.#toAddress(ownerAddress, false);
            const contract = getContract<IOP721Contract>(
                collectionAddress,
                OP721_ABI,
                this.#provider,
                this.#network,
                ownerAddr,
            ) as IOP721Contract;

            const balResult = await contract.balanceOf(ownerAddr as unknown as string);
            if (balResult.revert !== undefined) return [];
            const balance = balResult.properties.balance;
            if (balance === 0n) return [];

            const tokenIds: bigint[] = [];
            const count = balance > 50n ? 50n : balance;
            for (let i = 0n; i < count; i++) {
                try {
                    const res = await contract.tokenOfOwnerByIndex(ownerAddr as unknown as string, i);
                    if (res.revert === undefined) {
                        tokenIds.push(res.properties.tokenId);
                    }
                } catch { break; }
            }
            return tokenIds;
        } catch {
            return [];
        }
    }

    /** Resolve an OP-20 token symbol. */
    public async resolveTokenSymbol(tokenAddress: string): Promise<string> {
        if (this.#provider === null || this.#network === null) return this.#shortAddr(tokenAddress);
        try {
            const contract = getContract<IOP20Contract>(
                tokenAddress,
                OP_20_ABI,
                this.#provider,
                this.#network,
            ) as IOP20Contract;
            const meta = await contract.metadata();
            if (meta.revert !== undefined) return this.#shortAddr(tokenAddress);
            const decimals = Number(meta.properties.decimals);
            if (!isNaN(decimals)) {
                this.#decimalsCache.set(tokenAddress.toLowerCase(), decimals);
            }
            return meta.properties.symbol as string;
        } catch {
            return this.#shortAddr(tokenAddress);
        }
    }

    /** Resolve an OP-20 token's decimal count. */
    public async resolveTokenDecimals(tokenAddress: string): Promise<number> {
        const key = tokenAddress.toLowerCase();
        const cached = this.#decimalsCache.get(key);
        if (cached !== undefined) return cached;

        if (this.#provider === null || this.#network === null) return 18;
        try {
            const contract = getContract<IOP20Contract>(
                tokenAddress,
                OP_20_ABI,
                this.#provider,
                this.#network,
            ) as IOP20Contract;
            const meta = await contract.metadata();
            if (meta.revert !== undefined) return 18;
            const decimals = Number(meta.properties.decimals);
            const result = isNaN(decimals) ? 18 : decimals;
            this.#decimalsCache.set(key, result);
            return result;
        } catch {
            return 18;
        }
    }

    // ── Write Operations ──────────────────────────────────────────────────────

    /** Approve escrow to take an NFT (OP-721 approve). */
    public async approveNft(
        collectionAddress: string,
        tokenId: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();
        if (this.#contractAddress === null) throw new Error('Contract address not set');

        const [senderAddr, spender] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(this.#contractAddress),
        ]);

        const nftContract = getContract<IOP721Contract>(
            collectionAddress,
            OP721_ABI,
            this.#provider!,
            this.#network!,
            senderAddr,
        ) as IOP721Contract;

        const sim = await nftContract.approve(spender as unknown as string, tokenId);
        if (sim.revert !== undefined) throw new Error(`NFT approval reverted: ${sim.revert}`);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: senderAddress,
            maximumAllowedSatToSpend: 150_000n,
            feeRate,
            network: this.#network!,
        });

        return extractBitcoinTxId(receipt as TxReceipt);
    }

    /** Approve escrow to spend OP-20 tokens (increaseAllowance). */
    public async approveToken(
        tokenAddress: string,
        amount: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();
        if (this.#contractAddress === null) throw new Error('Contract address not set');

        const [senderAddr, spender] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(this.#contractAddress),
        ]);

        const tokenContract = getContract<IOP20Contract>(
            tokenAddress,
            OP_20_ABI,
            this.#provider!,
            this.#network!,
            senderAddr,
        ) as IOP20Contract;

        const sim = await tokenContract.increaseAllowance(spender, amount);
        if (sim.revert !== undefined) throw new Error(`Token approval reverted: ${sim.revert}`);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: senderAddress,
            maximumAllowedSatToSpend: 150_000n,
            feeRate,
            network: this.#network!,
        });

        return extractBitcoinTxId(receipt as TxReceipt);
    }

    /** Create an NFT offer. */
    public async createOffer(
        offerType: number,
        offeredCollection: string,
        offeredTokenId: bigint,
        offeredAmount: bigint,
        wantedCollection: string,
        wantedTokenId: bigint,
        wantedAmount: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<{ offerId: bigint; txId: string }> {
        this.#assertInitialized();

        const [senderAddr, offCollAddr, wantCollAddr] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(offeredCollection),
            this.#toAddress(wantedCollection),
        ]);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.createOffer(
            offerType,
            offCollAddr as unknown as string,
            offeredTokenId,
            offeredAmount,
            wantCollAddr as unknown as string,
            wantedTokenId,
            wantedAmount,
        );
        if (sim.revert !== undefined) throw new Error(`Create NFT offer reverted: ${sim.revert}`);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: senderAddress,
            maximumAllowedSatToSpend: 200_000n,
            feeRate,
            network: this.#network!,
        });

        return { offerId: sim.properties.offerId, txId: extractBitcoinTxId(receipt as TxReceipt) };
    }

    /** Accept an NFT offer. */
    public async acceptOffer(
        offerId: bigint,
        acceptorTokenId: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();

        const senderAddr = await this.#toAddress(senderAddress, false);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.acceptOffer(offerId, acceptorTokenId);
        if (sim.revert !== undefined) throw new Error(`Accept NFT offer reverted: ${sim.revert}`);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: senderAddress,
            maximumAllowedSatToSpend: 200_000n,
            feeRate,
            network: this.#network!,
        });

        return extractBitcoinTxId(receipt as TxReceipt);
    }

    /** Cancel an NFT offer. */
    public async cancelOffer(
        offerId: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();

        const senderAddr = await this.#toAddress(senderAddress, false);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.cancelOffer(offerId);
        if (sim.revert !== undefined) throw new Error(`Cancel NFT offer reverted: ${sim.revert}`);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: senderAddress,
            maximumAllowedSatToSpend: 150_000n,
            feeRate,
            network: this.#network!,
        });

        return extractBitcoinTxId(receipt as TxReceipt);
    }

    /** Wait for a transaction to be confirmed. */
    public async waitForTransaction(txId: string): Promise<void> {
        return this.#waitForTx(txId);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    async #toAddress(str: string, isContract = true): Promise<Address> {
        return this.#provider!.getPublicKeyInfo(str, isContract);
    }

    async #waitForTx(txId: string, maxAttempts = 60, intervalMs = 5000): Promise<void> {
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
            try {
                const receipt = await this.#provider!.getTransactionReceipt(txId);
                if (receipt !== null && receipt !== undefined) return;
            } catch { /* keep retrying */ }
        }
        throw new Error(`Transaction ${txId} was not confirmed within ${(maxAttempts * intervalMs) / 1000}s`);
    }

    #assertInitialized(): void {
        if (this.#contract === null || this.#provider === null) {
            throw new Error('NFTEscrowService not initialized. Call initialize() first.');
        }
    }

    /** IPFS gateways in priority order (OPNet gateway first). */
    static readonly #IPFS_GATEWAYS = [
        'https://ipfs.opnet.org/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
        'https://cloudflare-ipfs.com/ipfs/',
        'https://ipfs.io/ipfs/',
    ];

    /** Convert ipfs:// URIs to an HTTP gateway URL. */
    #resolveIpfsUri(uri: string): string {
        if (uri.startsWith('ipfs://')) {
            return `${NFTEscrowService.#IPFS_GATEWAYS[0]}${uri.slice(7)}`;
        }
        return uri;
    }

    /** Fetch JSON metadata from a URI (with IPFS fallbacks) and extract the image field. */
    async #fetchMetadataImage(uri: string): Promise<string | null> {
        // If it's an IPFS-based URL, try all gateways
        const urls = uri.includes('/ipfs/') ? this.#ipfsUrlFallbacks(uri) : [uri];

        for (const url of urls) {
            try {
                const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
                if (!resp.ok) continue;
                const json: unknown = await resp.json();
                if (typeof json !== 'object' || json === null) continue;
                const meta = json as Record<string, unknown>;
                const raw = meta['image'] ?? meta['image_url'] ?? meta['image_uri'];
                if (typeof raw !== 'string' || raw.length === 0) continue;
                return this.#resolveIpfsUri(raw);
            } catch { continue; }
        }
        return null;
    }

    /** Given an IPFS gateway URL, produce fallback URLs using all gateways. */
    #ipfsUrlFallbacks(url: string): string[] {
        const idx = url.indexOf('/ipfs/');
        if (idx === -1) return [url];
        const cid = url.slice(idx + 6);
        return NFTEscrowService.#IPFS_GATEWAYS.map((gw) => `${gw}${cid}`);
    }

    #shortAddr(addr: string): string {
        if (addr.length <= 12) return addr;
        return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    }
}

export const nftEscrowService = NFTEscrowService.getInstance();
