import { getContract, JSONRpcProvider } from 'opnet';
import type { IOP20Contract } from 'opnet';
import { type Network, Transaction } from '@btc-vision/bitcoin';
import type { Address } from '@btc-vision/transaction';
import { AUTO_VAULT_ABI, type IAutoVaultContract } from '../abi/AutoVaultABI.js';
import { OP_20_ABI } from 'opnet';
import { resolveRpcUrl } from '../config/networks.js';
import type { VaultInfo, UserVaultInfo } from '../types/index.js';

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
 * Singleton service for all AutoVault contract interactions.
 */
export class AutoVaultService {
    static #instance: AutoVaultService | null = null;

    #provider: JSONRpcProvider | null = null;
    #contract: IAutoVaultContract | null = null;
    #network: Network | null = null;
    #contractAddress: string | null = null;

    readonly #decimalsCache = new Map<string, number>();

    private constructor() {}

    public static getInstance(): AutoVaultService {
        if (AutoVaultService.#instance === null) {
            AutoVaultService.#instance = new AutoVaultService();
        }
        return AutoVaultService.#instance;
    }

    /** Initialize or re-initialize when network/address/sender changes */
    public initialize(contractAddress: string, network: Network, sender?: Address): void {
        const rpcUrl = resolveRpcUrl(network);

        if (this.#contractAddress !== contractAddress || this.#network !== network || this.#provider === null) {
            this.#provider = new JSONRpcProvider({ url: rpcUrl, network });
            this.#network = network;
            this.#contractAddress = contractAddress;
        }

        this.#contract = getContract<IAutoVaultContract>(
            contractAddress,
            AUTO_VAULT_ABI,
            this.#provider,
            network,
            sender,
        ) as IAutoVaultContract;
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

    /** Fetch vault info for a specific token */
    public async getVaultInfo(tokenAddress: string): Promise<VaultInfo | null> {
        this.#assertInitialized();
        try {
            const tokenAddr = await this.#toAddress(tokenAddress);
            const result = await this.#contract!.getVaultInfo(tokenAddr as unknown as string);
            if (result.revert !== undefined) return null;
            const p = result.properties;
            return {
                totalStaked: p.totalStaked,
                totalShares: p.totalShares,
                rewardRate: p.rewardRate,
                lastCompoundBlock: p.lastCompoundBlock,
                rewardPool: p.rewardPool,
                compoundFeeBps: p.compoundFeeBps,
                withdrawFeeBps: p.withdrawFeeBps,
            };
        } catch {
            return null;
        }
    }

    /** Fetch user info for a specific token */
    public async getUserInfo(tokenAddress: string, userAddress: string): Promise<UserVaultInfo | null> {
        this.#assertInitialized();
        try {
            const [tokenAddr, userAddr] = await Promise.all([
                this.#toAddress(tokenAddress),
                this.#toAddress(userAddress, false),
            ]);
            const result = await this.#contract!.getUserInfo(
                tokenAddr as unknown as string,
                userAddr as unknown as string,
            );
            if (result.revert !== undefined) return null;
            const p = result.properties;
            return {
                shares: p.shares,
                stakedEquivalent: p.stakedEquivalent,
                pendingRewardShare: p.pendingRewardShare,
            };
        } catch {
            return null;
        }
    }

    /** Fetch share price for a token */
    public async getSharePrice(tokenAddress: string): Promise<bigint | null> {
        this.#assertInitialized();
        try {
            const tokenAddr = await this.#toAddress(tokenAddress);
            const result = await this.#contract!.getSharePrice(tokenAddr as unknown as string);
            if (result.revert !== undefined) return null;
            return result.properties.pricePerShare;
        } catch {
            return null;
        }
    }

    /** Fetch pending rewards for a token */
    public async getPendingRewards(tokenAddress: string): Promise<bigint | null> {
        this.#assertInitialized();
        try {
            const tokenAddr = await this.#toAddress(tokenAddress);
            const result = await this.#contract!.getPendingRewards(tokenAddr as unknown as string);
            if (result.revert !== undefined) return null;
            return result.properties.pending;
        } catch {
            return null;
        }
    }

    /** Fetch fee recipient address from the contract */
    public async getFeeRecipient(_tokenAddress: string): Promise<string | null> {
        this.#assertInitialized();
        try {
            const result = await this.#contract!.getFeeInfo();
            if (result.revert !== undefined) return null;
            return result.properties.feeRecipient;
        } catch {
            return null;
        }
    }

    /** Fetch total fees collected for a specific token */
    public async getTotalFeesCollected(tokenAddress: string): Promise<bigint | null> {
        this.#assertInitialized();
        try {
            const tokenAddr = await this.#toAddress(tokenAddress);
            const result = await this.#contract!.getTotalFeesCollected(tokenAddr as unknown as string);
            if (result.revert !== undefined) return null;
            return result.properties.totalFees;
        } catch {
            return null;
        }
    }

    // ── Write Operations ──────────────────────────────────────────────────────

    /** Approve vault to spend a token (step 1 of deposit) */
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

    /** Deposit tokens into the vault (step 2 — after approval confirmed) */
    public async deposit(
        tokenAddress: string,
        amount: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<{ shares: bigint; txId: string }> {
        this.#assertInitialized();

        const [senderAddr, tokenAddr] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(tokenAddress),
        ]);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.deposit(tokenAddr as unknown as string, amount);
        if (sim.revert !== undefined) throw new Error(`Deposit reverted: ${sim.revert}`);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: senderAddress,
            maximumAllowedSatToSpend: 200_000n,
            feeRate,
            network: this.#network!,
        });

        return { shares: sim.properties.shares, txId: extractBitcoinTxId(receipt as TxReceipt) };
    }

    /** Withdraw shares from the vault */
    public async withdraw(
        tokenAddress: string,
        shares: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<{ netAmount: bigint; txId: string }> {
        this.#assertInitialized();

        const [senderAddr, tokenAddr] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(tokenAddress),
        ]);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.withdraw(tokenAddr as unknown as string, shares);
        if (sim.revert !== undefined) throw new Error(`Withdraw reverted: ${sim.revert}`);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: senderAddress,
            maximumAllowedSatToSpend: 200_000n,
            feeRate,
            network: this.#network!,
        });

        return { netAmount: sim.properties.netAmount, txId: extractBitcoinTxId(receipt as TxReceipt) };
    }

    /** Compound pending rewards (anyone can call) */
    public async compound(
        tokenAddress: string,
        senderAddress: string,
        feeRate: number,
    ): Promise<{ compounded: bigint; txId: string }> {
        this.#assertInitialized();

        const [senderAddr, tokenAddr] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(tokenAddress),
        ]);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.compound(tokenAddr as unknown as string);
        if (sim.revert !== undefined) throw new Error(`Compound reverted: ${sim.revert}`);

        const receipt = await sim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: senderAddress,
            maximumAllowedSatToSpend: 200_000n,
            feeRate,
            network: this.#network!,
        });

        return { compounded: sim.properties.compounded, txId: extractBitcoinTxId(receipt as TxReceipt) };
    }

    /** Fund the reward pool (admin — anyone can call) */
    public async fundRewards(
        tokenAddress: string,
        amount: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();

        const [senderAddr, tokenAddr] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(tokenAddress),
        ]);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.fundRewards(tokenAddr as unknown as string, amount);
        if (sim.revert !== undefined) throw new Error(`Fund rewards reverted: ${sim.revert}`);

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

    /** Set the reward rate (owner only) */
    public async setRewardRate(
        tokenAddress: string,
        rate: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();

        const [senderAddr, tokenAddr] = await Promise.all([
            this.#toAddress(senderAddress, false),
            this.#toAddress(tokenAddress),
        ]);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.setRewardRate(tokenAddr as unknown as string, rate);
        if (sim.revert !== undefined) throw new Error(`Set reward rate reverted: ${sim.revert}`);

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

    /** Set fee rates (owner only) */
    public async setFees(
        compoundFeeBps: bigint,
        withdrawFeeBps: bigint,
        senderAddress: string,
        feeRate: number,
    ): Promise<string> {
        this.#assertInitialized();

        const senderAddr = await this.#toAddress(senderAddress, false);
        (this.#contract as unknown as { setSender(a: Address): void }).setSender(senderAddr);

        const sim = await this.#contract!.setFees(compoundFeeBps, withdrawFeeBps);
        if (sim.revert !== undefined) throw new Error(`Set fees reverted: ${sim.revert}`);

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

    // ── Token metadata helpers ────────────────────────────────────────────────

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

    /** Get token balance for a user */
    public async getTokenBalance(tokenAddress: string, userAddress: string): Promise<bigint> {
        this.#assertInitialized();
        try {
            const [userAddr] = await Promise.all([
                this.#toAddress(userAddress, false),
            ]);
            const tokenContract = getContract<IOP20Contract>(
                tokenAddress,
                OP_20_ABI,
                this.#provider!,
                this.#network!,
            ) as IOP20Contract;
            const result = await tokenContract.balanceOf(userAddr);
            if (result.revert !== undefined) return 0n;
            return result.properties.balance;
        } catch {
            return 0n;
        }
    }

    /** Get current block number */
    public async getCurrentBlock(): Promise<bigint> {
        this.#assertInitialized();
        const blockNumber = await this.#provider!.getBlockNumber();
        return BigInt(blockNumber);
    }

    /** Wait for transaction confirmation */
    public async waitForTransaction(txId: string): Promise<void> {
        return this.#waitForTx(txId);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    async #toAddress(str: string, isContract = true): Promise<Address> {
        return this.#provider!.getPublicKeyInfo(str, isContract);
    }

    async #waitForTx(txId: string, intervalMs = 5000): Promise<void> {
        // Record start block — fallback for OPNet testnet where getTransactionReceipt
        // does not reliably return for Bitcoin txids
        let startBlock: bigint | null = null;
        try {
            startBlock = BigInt(await this.#provider!.getBlockNumber());
        } catch { /* ignore */ }

        for (;;) {
            await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
            try {
                const receipt = await this.#provider!.getTransactionReceipt(txId);
                if (receipt !== null && receipt !== undefined) return;
            } catch { /* keep retrying */ }

            // Fallback: if 3+ blocks have passed the tx has had enough time to confirm
            if (startBlock !== null) {
                try {
                    const current = BigInt(await this.#provider!.getBlockNumber());
                    if (current >= startBlock + 3n) return;
                } catch { /* ignore */ }
            }
        }
    }

    #assertInitialized(): void {
        if (this.#contract === null || this.#provider === null) {
            throw new Error('AutoVaultService not initialized. Call initialize() first.');
        }
    }

    #shortAddr(addr: string): string {
        if (addr.length <= 12) return addr;
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    }
}

export const autoVaultService = AutoVaultService.getInstance();
