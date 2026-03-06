import { getContract, JSONRpcProvider } from 'opnet';
import type { IOP20Contract } from 'opnet';
import { networks, type Network, hash160, toBech32, Transaction } from '@btc-vision/bitcoin';
import type { Address } from '@btc-vision/transaction';
import { OTC_ESCROW_ABI, type IOTCEscrowContract } from '../abi/OTCEscrowABI.js';
import { OP_20_ABI } from 'opnet';
import { resolveRpcUrl } from '../config/networks.js';
import { OFFER_STATUS, type Offer, type OTCStats } from '../types/index.js';

/** Max offers to fetch in one batch (prevents RPC overload) */
const MAX_FETCH = 200;

/** Receipt shape returned by sendTransaction */
interface TxReceipt {
    readonly transactionId: string;
    readonly rawTransaction?: string;
}

/**
 * Extract the real Bitcoin txid from a sendTransaction receipt.
 * Prefers computing from rawTransaction (double-SHA256 + reverse = real mempool txid).
 * Falls back to receipt.transactionId if rawTransaction is unavailable.
 */
function extractBitcoinTxId(receipt: TxReceipt): string {
    // If rawTransaction hex is available, compute the real Bitcoin txid
    if (receipt.rawTransaction != null && receipt.rawTransaction.length > 0) {
        try {
            const tx = Transaction.fromHex(receipt.rawTransaction);
            return tx.getId();
        } catch {
            // Parsing failed — fall through to transactionId
        }
    }
    // Fallback: normalize the OPNet transactionId
    const str = String(receipt.transactionId).trim();
    const hex = str.startsWith('0x') ? str.slice(2) : str;
    if (!/^[0-9a-fA-F]+$/.test(hex)) return str;
    return hex.toLowerCase();
}

/**
 * Singleton service for all OTC Escrow contract interactions.
 * ONE provider instance per network, ONE contract instance per address.
 */
export class OTCEscrowService {
    static #instance: OTCEscrowService | null = null;

    #provider: JSONRpcProvider | null = null;
    #contract: IOTCEscrowContract | null = null;
    #network: Network | null = null;
    #contractAddress: string | null = null;

    /** Cache: tokenAddress (lowercase) → decimals */
    readonly #decimalsCache = new Map<string, number>();

    private constructor() {}

    /**
     * Compute the P2OP (opt1s…) address directly from the raw 32-byte MLDSA hash.
     * Replicates EcKeyPair.p2op: witnessProgram = [0x00, ...HASH160(bytes)], version 16.
     * Used when the Address prototype methods are unavailable (wallet serialisation).
     */
    public static computeP2opFromBytes(bytes: Uint8Array, network: Network): string {
        const h160 = hash160(bytes);
        const witnessProgram = new Uint8Array(21);
        witnessProgram[0] = 0; // deploymentVersion = 0
        witnessProgram.set(h160, 1);
        return toBech32(witnessProgram, 16, network.bech32);
    }

    public static getInstance(): OTCEscrowService {
        if (OTCEscrowService.#instance === null) {
            OTCEscrowService.#instance = new OTCEscrowService();
        }
        return OTCEscrowService.#instance;
    }

    /** Initialize or re-initialize when network/address/sender changes. */
    public initialize(contractAddress: string, network: Network, sender?: Address): void {
        const rpcUrl = resolveRpcUrl(network);

        // Re-create provider only when network changes
        if (this.#contractAddress !== contractAddress || this.#network !== network || this.#provider === null) {
            this.#provider = new JSONRpcProvider({ url: rpcUrl, network });
            this.#network = network;
            this.#contractAddress = contractAddress;
        }

        // Always re-create contract so sender stays current
        this.#contract = getContract<IOTCEscrowContract>(
            contractAddress,
            OTC_ESCROW_ABI,
            this.#provider,
            network,
            sender,
        ) as IOTCEscrowContract;
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

    /** Convert an opnet Address object (or string) to a bech32 p2op string (for contracts). */
    #addrStr(val: unknown): string {
        if (typeof val === 'string') return val;
        const a = val as { p2op(n: Network): string };
        return a.p2op(this.#network!);
    }

    /** Convert an opnet Address to P2TR (opt1p…) for user addresses (creator). */
    #addrP2tr(val: unknown): string {
        if (typeof val === 'string') return val;
        try {
            const a = val as { p2tr(n: Network): string };
            if (typeof a.p2tr === 'function') return a.p2tr(this.#network!);
        } catch { /* not a valid taproot key, fall through */ }
        return this.#addrStr(val);
    }

    /** Fetch a single offer by ID. Returns null if not found or on error. */
    public async getOffer(offerId: bigint): Promise<Offer | null> {
        this.#assertInitialized();
        try {
            const result = await this.#contract!.getOffer(offerId);
            if (result.revert !== undefined) return null;
            const p = result.properties;

            // Only decode acceptor for accepted offers (status 1)
            const status = Number(p.status) as 0 | 1 | 2;
            let acceptorAddr = '';
            if (status === OFFER_STATUS.ACCEPTED) {
                try {
                    acceptorAddr = this.#addrP2tr(p.acceptor);
                } catch {
                    // Decoding failed — leave empty
                }
            }

            return {
                id: offerId,
                creator: this.#addrP2tr(p.creator),
                acceptor: acceptorAddr,
                offeredToken: this.#addrStr(p.offeredToken),
                offeredAmount: p.offeredAmount,
                wantedToken: this.#addrStr(p.wantedToken),
                wantedAmount: p.wantedAmount,
                status,
                createdAt: Number(p.createdAt),
            };
        } catch {
            return null;
        }
    }

    /** Fetch all offers (up to MAX_FETCH), newest first. */
    public async getAllOffers(): Promise<Offer[]> {
        this.#assertInitialized();

        const countResult = await this.#contract!.getNextOfferId();
        if (countResult.revert !== undefined) return [];

        const total = countResult.properties.nextId;
        if (total === 0n) return [];

        // Fetch last MAX_FETCH offers, newest first
        const startId = total > BigInt(MAX_FETCH) ? total - BigInt(MAX_FETCH) : 0n;
        const ids: bigint[] = [];
        for (let i = total - 1n; i >= startId; i--) {
            ids.push(i);
        }

        const results = await Promise.all(ids.map((id) => this.getOffer(id)));
        return results.filter((o): o is Offer => o !== null);
    }

    /** Fetch only active offers. */
    public async getActiveOffers(): Promise<Offer[]> {
        const all = await this.getAllOffers();
        return all.filter((o) => o.status === OFFER_STATUS.ACTIVE);
    }

    /** Fetch offers created by a specific address. */
    public async getOffersByCreator(creatorAddress: string): Promise<Offer[]> {
        const all = await this.getAllOffers();
        return all.filter((o) => o.creator.toLowerCase() === creatorAddress.toLowerCase());
    }

    /** Compute stats for the stats bar. */
    public async getStats(): Promise<OTCStats> {
        const all = await this.getAllOffers();
        const active = all.filter((o) => o.status === OFFER_STATUS.ACTIVE);
        return {
            activeOffers: active.length,
            totalOffers: all.length,
            totalVolume: 0n, // placeholder — would need volume tracking
        };
    }

    // ── Write Operations ──────────────────────────────────────────────────────

    /**
     * Approve the escrow to spend the offered token.
     * Returns the txId immediately after broadcast (does NOT wait for confirmation).
     * Call `waitForTransaction()` separately to wait for block confirmation.
     */
    public async approveOfferedToken(
        offeredToken: string,
        offeredAmount: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();
        if (this.#contractAddress === null) throw new Error('Contract address not set');

        const [senderAddr, spender] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(this.#contractAddress!),
        ]);

        const tokenContract = getContract<IOP20Contract>(
            offeredToken,
            OP_20_ABI,
            this.#provider!,
            this.#network!,
            senderAddr,
        ) as IOP20Contract;

        const sim = await tokenContract.increaseAllowance(spender, offeredAmount);
        if (sim.revert !== undefined) throw new Error(`Approval reverted: ${sim.revert}`);

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

    /**
     * Wait for a transaction to be confirmed in a block.
     * Use between approve and the next contract call.
     */
    public async waitForTransaction(txId: string): Promise<void> {
        return this.#waitForTx(txId);
    }

    /**
     * Step 2 of 2: Create the offer (tokens are pulled by the contract).
     * Caller must have called approveOfferedToken first.
     */
    public async createOffer(
        offeredToken: string,
        offeredAmount: bigint,
        wantedToken: string,
        wantedAmount: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<{ offerId: bigint; txId: string }> {
        this.#assertInitialized();

        const [senderAddr, offeredAddr, wantedAddr] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(offeredToken),
            this.#toAddress(wantedToken),
        ]);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.createOffer(
            offeredAddr as unknown as string,
            offeredAmount,
            wantedAddr as unknown as string,
            wantedAmount,
        );
        if (sim.revert !== undefined) throw new Error(`Create offer reverted: ${sim.revert}`);

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

    /**
     * Approve the escrow to spend the wanted token.
     * Returns the txId immediately after broadcast (does NOT wait for confirmation).
     * Call `waitForTransaction()` separately to wait for block confirmation.
     */
    public async approveWantedToken(
        wantedToken: string,
        wantedAmount: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();
        if (this.#contractAddress === null) throw new Error('Contract address not set');

        const [senderAddr, spender] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(this.#contractAddress!),
        ]);

        const tokenContract = getContract<IOP20Contract>(
            wantedToken,
            OP_20_ABI,
            this.#provider!,
            this.#network!,
            senderAddr,
        ) as IOP20Contract;

        const sim = await tokenContract.increaseAllowance(spender, wantedAmount);
        if (sim.revert !== undefined) throw new Error(`Approval reverted: ${sim.revert}`);

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

    /**
     * Step 2 of 2: Accept an offer and execute the swap.
     * Caller must have called approveWantedToken first.
     */
    public async acceptOffer(
        offerId: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();

        const senderAddr = await this.#toAddress(senderAddress, false);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.acceptOffer(offerId);
        if (sim.revert !== undefined) throw new Error(`Accept offer reverted: ${sim.revert}`);

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

    /** Cancel an offer (creator only). Single-step transaction. */
    public async cancelOffer(
        offerId: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();

        const senderAddr = await this.#toAddress(senderAddress, false);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.cancelOffer(offerId);
        if (sim.revert !== undefined) throw new Error(`Cancel offer reverted: ${sim.revert}`);

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

    /**
     * Resolve a Bitcoin P2TR address to its OPNet P2OP (opt1…) form.
     * Returns the original address unchanged on failure.
     */
    public async resolveP2opAddress(address: string): Promise<string> {
        if (this.#provider === null || this.#network === null) return address;
        try {
            const addrObj = await this.#toAddress(address, false);
            return this.#addrStr(addrObj);
        } catch {
            return address;
        }
    }

    // ── Token metadata helper ─────────────────────────────────────────────────

    /** Resolve an OP-20 token symbol for display. Returns abbreviated address on failure. */
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
            // Cache decimals while we have metadata
            const decimals = Number(meta.properties.decimals);
            if (!isNaN(decimals)) {
                this.#decimalsCache.set(tokenAddress.toLowerCase(), decimals);
            }
            return meta.properties.symbol as string;
        } catch {
            return this.#shortAddr(tokenAddress);
        }
    }

    /**
     * Resolve an OP-20 token's decimal count. Defaults to 18 on failure.
     * Results are cached per token address.
     */
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

    // ── Private ───────────────────────────────────────────────────────────────

    /** Resolve a bech32 address string to an Address object via RPC. */
    async #toAddress(str: string, isContract = true): Promise<Address> {
        return this.#provider!.getPublicKeyInfo(str, isContract);
    }

    /**
     * Poll until a transaction is confirmed (appears in a block).
     * Needed between approve and the next contract call so the allowance
     * is visible to the simulation of the second transaction.
     */
    async #waitForTx(txId: string, maxAttempts = 60, intervalMs = 5000): Promise<void> {
        for (let i = 0; i < maxAttempts; i++) {
            // Always wait before polling — ensures the tx has time to propagate
            await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
            try {
                const receipt = await this.#provider!.getTransactionReceipt(txId);
                // getTransactionReceipt returns null for pending txs (does not throw)
                if (receipt !== null && receipt !== undefined) return;
            } catch {
                // RPC error — keep retrying
            }
        }
        throw new Error(`Transaction ${txId} was not confirmed within ${(maxAttempts * intervalMs) / 1000}s`);
    }

    #assertInitialized(): void {
        if (this.#contract === null || this.#provider === null) {
            throw new Error('OTCEscrowService not initialized. Call initialize() first.');
        }
    }

    #shortAddr(addr: string): string {
        if (addr.length <= 12) return addr;
        return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    }
}

export const escrowService = OTCEscrowService.getInstance();

/** Regtest-compatible network detection */
export function isRegtest(network: Network): boolean {
    return network === networks.regtest;
}
