import { getContract, JSONRpcProvider } from 'opnet';
import type { IOP20Contract } from 'opnet';
import { type Network, Transaction } from '@btc-vision/bitcoin';
import type { Address } from '@btc-vision/transaction';
import { VESTING_VAULT_ABI, type IVestingVaultContract } from '../abi/VestingVaultABI.js';
import { OP_20_ABI } from 'opnet';
import { resolveRpcUrl } from '../config/networks.js';
import {
    SCHEDULE_STATUS,
    type VestingSchedule,
    type VestingStats,
} from '../types/index.js';

/** Max schedules to fetch in one batch */
const MAX_FETCH = 200;

/** Receipt shape returned by sendTransaction */
interface TxReceipt {
    readonly transactionId: string;
    readonly rawTransaction?: string;
}

/** Extract real Bitcoin txid from sendTransaction receipt */
function extractBitcoinTxId(receipt: TxReceipt): string {
    if (receipt.rawTransaction != null && receipt.rawTransaction.length > 0) {
        try {
            const tx = Transaction.fromHex(receipt.rawTransaction);
            return tx.getId();
        } catch {
            // fall through
        }
    }
    const str = String(receipt.transactionId).trim();
    const hex = str.startsWith('0x') ? str.slice(2) : str;
    if (!/^[0-9a-fA-F]+$/.test(hex)) return str;
    return hex.toLowerCase();
}

/**
 * Singleton service for all Vesting Vault contract interactions.
 */
export class VestingVaultService {
    static #instance: VestingVaultService | null = null;

    #provider: JSONRpcProvider | null = null;
    #contract: IVestingVaultContract | null = null;
    #network: Network | null = null;
    #contractAddress: string | null = null;

    readonly #decimalsCache = new Map<string, number>();

    private constructor() {}

    public static getInstance(): VestingVaultService {
        if (VestingVaultService.#instance === null) {
            VestingVaultService.#instance = new VestingVaultService();
        }
        return VestingVaultService.#instance;
    }

    /** Initialize or re-initialize when network/address/sender changes */
    public initialize(contractAddress: string, network: Network, sender?: Address): void {
        const rpcUrl = resolveRpcUrl(network);

        if (this.#contractAddress !== contractAddress || this.#network !== network || this.#provider === null) {
            this.#provider = new JSONRpcProvider({ url: rpcUrl, network });
            this.#network = network;
            this.#contractAddress = contractAddress;
        }

        this.#contract = getContract<IVestingVaultContract>(
            contractAddress,
            VESTING_VAULT_ABI,
            this.#provider,
            network,
            sender,
        ) as IVestingVaultContract;
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

    /** Convert Address object to P2OP string (for contracts/tokens) */
    #addrStr(val: unknown): string {
        if (typeof val === 'string') return val;
        const a = val as { p2op(n: Network): string };
        return a.p2op(this.#network!);
    }

    /** Convert Address to P2TR (for user addresses) */
    #addrP2tr(val: unknown): string {
        if (typeof val === 'string') return val;
        try {
            const a = val as { p2tr(n: Network): string };
            if (typeof a.p2tr === 'function') return a.p2tr(this.#network!);
        } catch { /* fall through */ }
        return this.#addrStr(val);
    }

    /** Fetch a single schedule by ID. Returns null if not found. */
    public async getSchedule(scheduleId: bigint, currentBlock?: bigint): Promise<VestingSchedule | null> {
        this.#assertInitialized();
        try {
            const result = await this.#contract!.getSchedule(scheduleId);
            if (result.revert !== undefined) return null;
            const p = result.properties;

            const totalAmount = p.totalAmount;
            const claimedAmount = p.claimedAmount;
            const startBlock = p.startBlock;
            const cliffBlocks = p.cliffBlocks;
            const durationBlocks = p.durationBlocks;
            const revoked = p.revoked;
            const vestingType = Number(p.vestingType);
            const stepsCount = Number(p.stepsCount);

            // Compute vested amount client-side if we have a block number
            let vestedAmount = 0n;
            if (currentBlock !== undefined && currentBlock > startBlock) {
                const elapsed = currentBlock - startBlock;
                if (elapsed < cliffBlocks) {
                    vestedAmount = 0n;
                } else if (elapsed >= durationBlocks) {
                    vestedAmount = totalAmount;
                } else if (vestingType === 1 && stepsCount > 0) {
                    // Stepped: tokens unlock in equal chunks
                    const stepDuration = durationBlocks / BigInt(stepsCount);
                    const completedSteps = stepDuration > 0n ? elapsed / stepDuration : BigInt(stepsCount);
                    const capped = completedSteps > BigInt(stepsCount) ? BigInt(stepsCount) : completedSteps;
                    vestedAmount = (totalAmount * capped) / BigInt(stepsCount);
                } else {
                    vestedAmount = (totalAmount * elapsed) / durationBlocks;
                }
            }

            const claimableAmount = vestedAmount > claimedAmount ? vestedAmount - claimedAmount : 0n;

            // Determine visual status
            let status: number;
            if (revoked) {
                status = SCHEDULE_STATUS.REVOKED;
            } else if (vestedAmount >= totalAmount) {
                status = SCHEDULE_STATUS.FULLY_VESTED;
            } else if (currentBlock !== undefined && (currentBlock - startBlock) < cliffBlocks) {
                status = SCHEDULE_STATUS.CLIFF_PENDING;
            } else {
                status = SCHEDULE_STATUS.ACTIVE;
            }

            const progressPercent = totalAmount > 0n
                ? Number((vestedAmount * 10000n) / totalAmount) / 100
                : 0;

            return {
                id: scheduleId,
                creator: this.#addrP2tr(p.creator),
                beneficiary: this.#addrP2tr(p.beneficiary),
                token: this.#addrStr(p.token),
                totalAmount,
                claimedAmount,
                startBlock,
                cliffBlocks,
                durationBlocks,
                revocable: p.revocable,
                revoked,
                vestingType,
                stepsCount,
                vestedAmount,
                claimableAmount,
                status: status as (typeof SCHEDULE_STATUS)[keyof typeof SCHEDULE_STATUS],
                progressPercent,
            };
        } catch {
            return null;
        }
    }

    /** Fetch all schedules (up to MAX_FETCH), newest first */
    public async getAllSchedules(currentBlock?: bigint): Promise<VestingSchedule[]> {
        this.#assertInitialized();

        const countResult = await this.#contract!.getNextScheduleId();
        if (countResult.revert !== undefined) return [];

        const total = countResult.properties.nextId;
        if (total === 0n) return [];

        const startId = total > BigInt(MAX_FETCH) ? total - BigInt(MAX_FETCH) : 0n;
        const ids: bigint[] = [];
        for (let i = total - 1n; i >= startId; i--) {
            ids.push(i);
        }

        const results = await Promise.all(ids.map((id) => this.getSchedule(id, currentBlock)));
        return results.filter((s): s is VestingSchedule => s !== null);
    }

    /** Compute stats */
    public async getStats(currentBlock?: bigint, userAddress?: string): Promise<VestingStats> {
        const all = await this.getAllSchedules(currentBlock);
        const active = all.filter((s) => s.status === SCHEDULE_STATUS.ACTIVE || s.status === SCHEDULE_STATUS.CLIFF_PENDING);
        const claimed = all.filter((s) => s.status === SCHEDULE_STATUS.FULLY_VESTED && s.claimedAmount >= s.totalAmount);

        let yourClaimable = 0n;
        if (userAddress !== undefined) {
            const lowerUser = userAddress.toLowerCase();
            for (const s of all) {
                if (s.beneficiary.toLowerCase() === lowerUser && s.claimableAmount > 0n) {
                    yourClaimable += s.claimableAmount;
                }
            }
        }

        let totalValueLocked = 0n;
        const tvlMap = new Map<string, bigint>();
        for (const s of all) {
            if (!s.revoked) {
                const remaining = s.totalAmount - s.claimedAmount;
                totalValueLocked += remaining;
                const key = s.token.toLowerCase();
                tvlMap.set(key, (tvlMap.get(key) ?? 0n) + remaining);
            }
        }

        const tvlByToken = Array.from(tvlMap.entries()).map(([token, amount]) => ({ token, amount }));

        return {
            activeSchedules: active.length,
            totalSchedules: all.length,
            totalClaimed: claimed.length,
            yourClaimable,
            totalValueLocked,
            tvlByToken,
        };
    }

    // ── Write Operations ──────────────────────────────────────────────────────

    /** Approve the vault to spend the token (step 1 of createSchedule) */
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
            this.#toAddress(this.#contractAddress!),
        ]);

        const tokenContract = getContract<IOP20Contract>(
            tokenAddress,
            OP_20_ABI,
            this.#provider!,
            this.#network!,
            senderAddr,
        ) as IOP20Contract;

        const sim = await tokenContract.increaseAllowance(spender, amount);
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

    /** Wait for transaction confirmation */
    public async waitForTransaction(txId: string): Promise<void> {
        return this.#waitForTx(txId);
    }

    /** Create a vesting schedule (step 2 — after approval is confirmed) */
    public async createSchedule(
        beneficiary: string,
        tokenAddress: string,
        totalAmount: bigint,
        cliffBlocks: bigint,
        durationBlocks: bigint,
        revocable: boolean,
        senderAddress: string,
        feeRate: number,
        vestingType = 0,
        stepsCount = 0,
    ): Promise<{ scheduleId: bigint; txId: string }> {
        this.#assertInitialized();

        const [senderAddr, beneficiaryAddr, tokenAddr] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(beneficiary, false),
            this.#toAddress(tokenAddress),
        ]);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.createSchedule(
            beneficiaryAddr as unknown as string,
            tokenAddr as unknown as string,
            totalAmount,
            cliffBlocks,
            durationBlocks,
            revocable,
            BigInt(vestingType),
            BigInt(stepsCount),
        );
        if (sim.revert !== undefined) throw new Error(`Create schedule reverted: ${sim.revert}`);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: senderAddress,
            maximumAllowedSatToSpend: 200_000n,
            feeRate,
            network: this.#network!,
        });

        return { scheduleId: sim.properties.scheduleId, txId: extractBitcoinTxId(receipt as TxReceipt) };
    }

    /** Claim vested tokens — returns txId + claimed amount */
    public async claim(
        scheduleId: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<{ txId: string; claimed: bigint }> {
        this.#assertInitialized();

        const senderAddr = await this.#toAddress(senderAddress, false);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.claim(scheduleId);
        if (sim.revert !== undefined) throw new Error(`Claim reverted: ${sim.revert}`);

        const rawClaimed = sim.properties.claimed;
        const claimed: bigint = typeof rawClaimed === 'bigint' ? rawClaimed : BigInt(rawClaimed);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: senderAddress,
            maximumAllowedSatToSpend: 150_000n,
            feeRate,
            network: this.#network!,
        });

        return { txId: extractBitcoinTxId(receipt as TxReceipt), claimed };
    }

    /** Revoke a vesting schedule (creator only) */
    public async revoke(
        scheduleId: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();

        const senderAddr = await this.#toAddress(senderAddress, false);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.revoke(scheduleId);
        if (sim.revert !== undefined) throw new Error(`Revoke reverted: ${sim.revert}`);

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

    /** Transfer beneficiary rights to a new address */
    public async transferBeneficiary(
        scheduleId: bigint,
        newBeneficiary: string,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();

        const [senderAddr, beneficiaryAddr] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(newBeneficiary, false),
        ]);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.transferBeneficiary(
            scheduleId,
            beneficiaryAddr as unknown as string,
        );
        if (sim.revert !== undefined) throw new Error(`Transfer reverted: ${sim.revert}`);

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

    // ── Token metadata helper ─────────────────────────────────────────────────

    /** Resolve an OP-20 token symbol */
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

    /** Resolve token decimals (cached) */
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

    /** Get current block number */
    public async getCurrentBlock(): Promise<bigint> {
        this.#assertInitialized();
        const blockNumber = await this.#provider!.getBlockNumber();
        return BigInt(blockNumber);
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
            } catch {
                // keep retrying
            }
        }
        throw new Error(`Transaction ${txId} was not confirmed within ${(maxAttempts * intervalMs) / 1000}s`);
    }

    #assertInitialized(): void {
        if (this.#contract === null || this.#provider === null) {
            throw new Error('VestingVaultService not initialized. Call initialize() first.');
        }
    }

    #shortAddr(addr: string): string {
        if (addr.length <= 12) return addr;
        return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    }
}

export const vestingService = VestingVaultService.getInstance();
