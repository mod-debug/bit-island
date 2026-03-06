import { getContract, JSONRpcProvider, type TransactionParameters } from 'opnet';
import { type Network } from '@btc-vision/bitcoin';
import type { Address } from '@btc-vision/transaction';
import { BTC_MONKEYS_ABI, type IBtcMonkeys } from '../abi/BtcMonkeysABI.js';
import { resolveRpcUrl } from '../config/networks.js';
import type { CollectionStats, MintResult } from '../types/index.js';

/**
 * Singleton service — one instance, cached provider + contract.
 */
export class NFTService {
    static #instance: NFTService | null = null;

    #provider: JSONRpcProvider | null = null;
    #contract: IBtcMonkeys | null = null;
    #network: Network | null = null;
    #contractAddress: string | null = null;

    private constructor() {}

    public static getInstance(): NFTService {
        if (NFTService.#instance === null) {
            NFTService.#instance = new NFTService();
        }
        return NFTService.#instance;
    }

    public initialize(contractAddress: string, network: Network, sender?: Address): void {
        const sameConfig =
            this.#contractAddress === contractAddress &&
            this.#network === network &&
            this.#provider !== null;

        if (sameConfig) return;

        const rpcUrl = resolveRpcUrl(network);
        this.#provider = new JSONRpcProvider({ url: rpcUrl, network });
        this.#network = network;
        this.#contractAddress = contractAddress;
        this.#contract = getContract<IBtcMonkeys>(
            contractAddress,
            BTC_MONKEYS_ABI,
            this.#provider,
            network,
            sender,
        ) as IBtcMonkeys;
    }

    /** Mint one NFT. Simulates first, then sends. */
    public async mint(txParams: TransactionParameters): Promise<MintResult> {
        if (this.#contract === null) throw new Error('NFTService not initialized.');

        const simulation = await this.#contract.mint();
        if (simulation.revert !== undefined) {
            throw new Error(`Mint reverted: ${simulation.revert}`);
        }

        const receipt = await simulation.sendTransaction({
            ...txParams,
            signer: null,
            mldsaSigner: null,
        });

        return {
            tokenId: simulation.properties.tokenId,
            txId: receipt.transactionId,
        };
    }

    /** Fetch collection stats: supply, max, price, and owner balance. */
    public async getStats(ownerAddress?: string): Promise<CollectionStats> {
        if (this.#contract === null) throw new Error('NFTService not initialized.');

        const [supplyResult, maxResult, priceResult] = await Promise.all([
            this.#contract.totalSupply(),
            this.#contract.maxSupply(),
            this.#contract.mintPrice(),
        ]);

        if (supplyResult.revert !== undefined) throw new Error('Failed to fetch totalSupply');
        if (maxResult.revert !== undefined) throw new Error('Failed to fetch maxSupply');
        if (priceResult.revert !== undefined) throw new Error('Failed to fetch mintPrice');

        let ownerBalance = 0n;
        if (ownerAddress !== undefined && ownerAddress.length > 0) {
            const balResult = await this.#contract.balanceOf(ownerAddress);
            if (balResult.revert === undefined) {
                ownerBalance = balResult.properties.balance;
            }
        }

        return {
            totalMinted: supplyResult.properties.total,
            maxSupply: maxResult.properties.max,
            mintPrice: priceResult.properties.price,
            ownerBalance,
        };
    }

    public get provider(): JSONRpcProvider | null {
        return this.#provider;
    }

    public reset(): void {
        this.#provider = null;
        this.#contract = null;
        this.#network = null;
        this.#contractAddress = null;
    }
}

export const nftService = NFTService.getInstance();
