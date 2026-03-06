import { useState, useEffect, useCallback, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { autoVaultService } from '../services/AutoVaultService.js';
import { getAutoVaultAddress } from '../config/contracts.js';
import { useToast } from '../components/Toast.js';
import type { VaultInfo, UserVaultInfo, TxStep } from '../types/index.js';
import { addTxEntry } from '../stores/txHistoryStore.js';
import { formatTokenAmount } from '../utils/tokenAmount.js';
import {
    useVaultPending,
    addVaultOp,
    patchVaultStep,
    setVaultSteps,
    markVaultStepsError,
    setVaultAwaitingConfirm,
    removeVaultOp,
    clearVaultOpsForWallet,
    type StoredFundParams,
} from '../stores/vaultPendingStore.js';

const DEFAULT_FEE_RATE = 10;
const POLL_INTERVAL_MS = 30_000;

const VAULT_HISTORY_KEY = 'btcmonkeys-vault-history';
const MAX_HISTORY = 100;

/** Serializable vault history entry for localStorage */
interface StoredVaultEntry {
    readonly id: number;
    readonly action: string;
    readonly token: string;
    readonly tokenSymbol: string;
    readonly amount: string;
    readonly fee: string;
    readonly shares: string;
    readonly txId: string;
    readonly timestamp: number;
    readonly walletAddress: string;
}

/** Vault history entry with bigint */
export interface VaultHistoryItem {
    readonly id: number;
    readonly action: 'deposit' | 'withdraw' | 'compound' | 'fund' | 'set-rate' | 'set-fees';
    readonly token: string;
    readonly tokenSymbol: string;
    readonly amount: bigint;
    readonly fee: bigint;
    readonly shares: bigint;
    readonly txId: string;
    readonly timestamp: number;
    readonly walletAddress: string;
}

function loadVaultHistory(): VaultHistoryItem[] {
    try {
        const raw = localStorage.getItem(VAULT_HISTORY_KEY);
        if (raw === null) return [];
        const parsed = JSON.parse(raw) as StoredVaultEntry[];
        return parsed.map((e) => ({
            ...e,
            action: e.action as VaultHistoryItem['action'],
            amount: BigInt(e.amount),
            fee: BigInt(e.fee),
            shares: BigInt(e.shares),
        }));
    } catch {
        return [];
    }
}

function saveVaultHistory(items: VaultHistoryItem[]): void {
    try {
        const serializable: StoredVaultEntry[] = items.map((e) => ({
            ...e,
            amount: e.amount.toString(),
            fee: e.fee.toString(),
            shares: e.shares.toString(),
        }));
        localStorage.setItem(VAULT_HISTORY_KEY, JSON.stringify(serializable));
    } catch { /* quota exceeded */ }
}

let historyEntries: VaultHistoryItem[] = loadVaultHistory();
let historyNextId = historyEntries.length > 0 ? Math.max(...historyEntries.map((e) => e.id)) + 1 : 1;

function addVaultHistoryEntry(entry: Omit<VaultHistoryItem, 'id'>): void {
    const newEntry: VaultHistoryItem = { ...entry, id: historyNextId++ };
    historyEntries = [newEntry, ...historyEntries];
    if (historyEntries.length > MAX_HISTORY) {
        historyEntries = historyEntries.slice(0, MAX_HISTORY);
    }
    saveVaultHistory(historyEntries);
}

function makeStep(label: string): TxStep {
    return { label, status: 'idle' };
}

/* ── Default step arrays (used as fallback when no op in store) ─── */

const DEFAULT_DEPOSIT_STEPS: TxStep[] = [
    makeStep('Approve token'), makeStep('Approve confirmation'),
    makeStep('Deposit tokens'), makeStep('Deposit confirmation'),
];
const DEFAULT_WITHDRAW_STEPS: TxStep[] = [
    makeStep('Withdraw tokens'), makeStep('Block confirmation'),
];
const DEFAULT_COMPOUND_STEPS: TxStep[] = [
    makeStep('Compound rewards'), makeStep('Block confirmation'),
];
const DEFAULT_FUND_STEPS: TxStep[] = [
    makeStep('Approve token'), makeStep('Approve confirmation'),
    makeStep('Fund reward pool'), makeStep('Fund confirmation'),
];

/* ═══════════════════════════════════════════════════════════════════ */

export function useAutoVault() {
    const { walletAddress, network } = useWalletConnect();
    const { toast } = useToast();

    /* ── Module-level store: vault pending ops (immune to React state loss) ── */
    const allVaultOps = useVaultPending();
    const walletLower = (walletAddress ?? '').toLowerCase();

    // Derive display state from store (filtered by current wallet)
    const depositOp = walletLower.length > 0
        ? allVaultOps.find((o) => o.type === 'deposit' && o.walletAddress.toLowerCase() === walletLower)
        : undefined;
    const withdrawOp = walletLower.length > 0
        ? allVaultOps.find((o) => o.type === 'withdraw' && o.walletAddress.toLowerCase() === walletLower)
        : undefined;
    const compoundOp = walletLower.length > 0
        ? allVaultOps.find((o) => o.type === 'compound' && o.walletAddress.toLowerCase() === walletLower)
        : undefined;
    const fundOp = walletLower.length > 0
        ? allVaultOps.find((o) => o.type === 'fund' && o.walletAddress.toLowerCase() === walletLower)
        : undefined;

    const depositing = depositOp !== undefined;
    const depositSteps = depositOp?.steps ?? DEFAULT_DEPOSIT_STEPS;
    const depositAwaitingConfirm = depositOp?.awaitingConfirm ?? false;

    const withdrawing = withdrawOp !== undefined;
    const withdrawSteps = withdrawOp?.steps ?? DEFAULT_WITHDRAW_STEPS;

    const compounding = compoundOp !== undefined;
    const compoundSteps = compoundOp?.steps ?? DEFAULT_COMPOUND_STEPS;

    const funding = fundOp !== undefined;
    const fundSteps = fundOp?.steps ?? DEFAULT_FUND_STEPS;
    const fundAwaitingConfirm = fundOp?.awaitingConfirm ?? false;

    // Flow control refs (prevent double-calls, survive closures)
    const depositingRef = useRef(depositing);
    depositingRef.current = depositing;
    const fundingRef = useRef(funding);
    fundingRef.current = funding;

    // Promise resolvers for HARD PAUSE (Confirm button)
    const depositConfirmResolverRef = useRef<(() => void) | null>(null);
    const fundConfirmResolverRef = useRef<(() => void) | null>(null);

    // Fund params ref (for async flow continuity)
    const fundParamsRef = useRef<{ tokenAddress: string; amount: bigint; sym: string; dec: number; formattedAmt: string } | null>(
        fundOp?.fundParams !== undefined
            ? { tokenAddress: fundOp.fundParams.tokenAddress, amount: BigInt(fundOp.fundParams.amount), sym: fundOp.fundParams.sym, dec: fundOp.fundParams.dec, formattedAmt: fundOp.fundParams.formattedAmt }
            : null,
    );

    // Selected token
    const [selectedToken, setSelectedToken] = useState<string>('');

    // Vault data
    const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null);
    const [userInfo, setUserInfo] = useState<UserVaultInfo | null>(null);
    const [sharePrice, setSharePrice] = useState<bigint | null>(null);
    const [pendingRewards, setPendingRewards] = useState<bigint | null>(null);
    const [feeRecipient, setFeeRecipient] = useState<string | null>(null);
    const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
    const [currentBlock, setCurrentBlock] = useState<bigint>(0n);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Errors (transient — fine as React state)
    const [depositError, setDepositError] = useState<string | null>(null);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);
    const [compoundError, setCompoundError] = useState<string | null>(null);
    const [fundError, setFundError] = useState<string | null>(null);

    // History — filtered by current wallet
    const [history, setHistory] = useState<VaultHistoryItem[]>(() => {
        if (walletAddress === null || walletAddress === undefined) return [];
        const lower = walletAddress.toLowerCase();
        return historyEntries.filter((e) => e.walletAddress.toLowerCase() === lower);
    });

    // Reset user data on wallet change
    const prevWalletRef = useRef(walletAddress);
    useEffect(() => {
        const prevWallet = prevWalletRef.current;
        prevWalletRef.current = walletAddress;

        setUserInfo(null);
        setTokenBalance(0n);
        setPendingRewards(null);

        if (walletAddress === null || walletAddress === undefined) {
            setHistory([]);
        } else {
            const lower = walletAddress.toLowerCase();
            setHistory(historyEntries.filter((e) => e.walletAddress.toLowerCase() === lower));
        }

        // Clear ALL pending ops only on REAL wallet switch (A → B)
        const isRealSwitch = prevWallet !== null && prevWallet !== undefined
            && walletAddress !== null && walletAddress !== undefined
            && prevWallet.toLowerCase() !== walletAddress.toLowerCase();
        if (isRealSwitch) {
            depositingRef.current = false;
            depositConfirmResolverRef.current = null;
            fundingRef.current = false;
            fundConfirmResolverRef.current = null;
            fundParamsRef.current = null;
            setDepositError(null);
            setWithdrawError(null);
            setCompoundError(null);
            setFundError(null);
            clearVaultOpsForWallet(prevWallet);
        }
    }, [walletAddress]);

    // Initialize service
    useEffect(() => {
        if (network === null) return;
        try {
            const addr = getAutoVaultAddress(network);
            autoVaultService.initialize(addr, network);
        } catch {
            // Not deployed yet
        }
    }, [network, walletAddress]);

    // Fetch all vault data
    const fetchVaultData = useCallback(async (): Promise<void> => {
        if (network === null || selectedToken === '') return;
        setLoading(true);
        setError(null);
        try {
            const addr = getAutoVaultAddress(network);
            autoVaultService.initialize(addr, network);

            const [info, price, pending, block, recipient] = await Promise.all([
                autoVaultService.getVaultInfo(selectedToken),
                autoVaultService.getSharePrice(selectedToken),
                autoVaultService.getPendingRewards(selectedToken),
                autoVaultService.getCurrentBlock(),
                autoVaultService.getFeeRecipient(selectedToken),
            ]);

            setVaultInfo(info);
            setSharePrice(price);
            setPendingRewards(pending);
            setCurrentBlock(block);
            setFeeRecipient(recipient);

            if (walletAddress !== null && walletAddress !== undefined) {
                const [uInfo, balance] = await Promise.all([
                    autoVaultService.getUserInfo(selectedToken, walletAddress),
                    autoVaultService.getTokenBalance(selectedToken, walletAddress),
                ]);
                setUserInfo(uInfo);
                setTokenBalance(balance);
            } else {
                setUserInfo(null);
                setTokenBalance(0n);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch vault data');
        } finally {
            setLoading(false);
        }
    }, [network, walletAddress, selectedToken]);

    useEffect(() => {
        void fetchVaultData();
    }, [fetchVaultData]);

    // Auto-refresh polling
    useEffect(() => {
        if (selectedToken === '') return;
        const interval = setInterval(() => { void fetchVaultData(); }, POLL_INTERVAL_MS);
        return () => { clearInterval(interval); };
    }, [fetchVaultData, selectedToken]);

    // ── Deposit (2-step: approve + deposit) with HARD PAUSE ─────────────────

    const resetDeposit = useCallback((): void => {
        depositConfirmResolverRef.current = null;
        depositingRef.current = false;
        setDepositError(null);
        removeVaultOp('deposit');
    }, []);

    const deposit = useCallback(
        async (tokenAddress: string, amount: bigint): Promise<boolean> => {
            if (depositingRef.current) return false;
            if (walletAddress === null || walletAddress === undefined || network === null) {
                setDepositError('Connect your wallet first');
                return false;
            }

            depositingRef.current = true;
            setDepositError(null);
            const initSteps: TxStep[] = [
                makeStep('Approve token'), makeStep('Block confirmation'),
                makeStep('Deposit tokens'), makeStep('Block confirmation'),
            ];
            addVaultOp({ type: 'deposit', steps: initSteps, startedAt: Date.now(), walletAddress, awaitingConfirm: false });

            try {
                const sym = await autoVaultService.resolveTokenSymbol(tokenAddress);
                const dec = await autoVaultService.resolveTokenDecimals(tokenAddress);
                const formattedLabel = `${formatTokenAmount(amount, dec)} ${sym}`;

                setVaultSteps('deposit', [
                    makeStep(`Approve ${formattedLabel}`),
                    makeStep('Approve confirmation'),
                    makeStep(`Deposit ${formattedLabel}`),
                    makeStep('Deposit confirmation'),
                ]);

                // Step 1: Approve
                patchVaultStep('deposit', 0, { status: 'pending' });
                const approveTxId = await autoVaultService.approveToken(tokenAddress, amount, walletAddress, DEFAULT_FEE_RATE);
                patchVaultStep('deposit', 0, { status: 'done', txId: approveTxId });
                addTxEntry('approve', null, approveTxId, 'ok', `Approve ${formattedLabel} for Deposit`, walletAddress);
                toast('info', 'Approval sent!', `${formattedLabel} — tx: ${approveTxId.slice(0, 10)}… — Waiting for block confirmation.`, '#pending-section');

                // Step 2: Wait for approve confirmation
                patchVaultStep('deposit', 1, { status: 'pending' });
                await autoVaultService.waitForTransaction(approveTxId);
                patchVaultStep('deposit', 1, { status: 'done' });
                toast('info', 'Approval confirmed!', `Click Confirm to deposit ${formattedLabel}.`, '#pending-section');

                // ── HARD PAUSE: await user click on Confirm button ──
                setVaultAwaitingConfirm('deposit', true);
                setTimeout(() => {
                    const el = document.getElementById('pending-section');
                    if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 150);

                const depositConfirmed = await new Promise<boolean>((resolve) => {
                    depositConfirmResolverRef.current = () => { resolve(true); };
                });
                if (!depositConfirmed) {
                    resetDeposit();
                    return false;
                }
                setVaultAwaitingConfirm('deposit', false);

                // Step 3: Deposit (broadcast) — wallet opens HERE after user clicked Confirm
                patchVaultStep('deposit', 2, { status: 'pending' });
                const { shares, txId } = await autoVaultService.deposit(tokenAddress, amount, walletAddress, DEFAULT_FEE_RATE);
                patchVaultStep('deposit', 2, { status: 'done', txId });

                const formattedAmt = formatTokenAmount(amount, dec);
                addTxEntry('create', null, txId, 'ok', `Deposit ${formattedAmt} ${sym} — awaiting confirmation`, walletAddress);
                toast('info', 'Deposit Sent!', `${formattedAmt} ${sym} deposit broadcast — waiting for block confirmation.`, '#pending-section');

                // Step 4: Wait for deposit confirmation
                patchVaultStep('deposit', 3, { status: 'pending' });
                await autoVaultService.waitForTransaction(txId);
                patchVaultStep('deposit', 3, { status: 'done' });

                toast('success', 'Deposit Confirmed!', `${formattedAmt} ${sym} staked — received ${formatTokenAmount(shares, dec)} shares.`, '#vault-history');

                addVaultHistoryEntry({
                    action: 'deposit',
                    token: tokenAddress,
                    tokenSymbol: sym,
                    amount,
                    fee: 0n,
                    shares,
                    txId,
                    timestamp: Date.now(),
                    walletAddress,
                });
                setHistory(historyEntries.filter((e) => e.walletAddress.toLowerCase() === walletAddress.toLowerCase()));

                removeVaultOp('deposit');
                depositingRef.current = false;
                void fetchVaultData();
                return true;
            } catch (err) {
                console.error('[Vault] Deposit error:', err);
                const msg = err instanceof Error ? err.message : 'Deposit failed';
                setDepositError(msg);
                toast('error', 'Deposit Failed', msg);
                markVaultStepsError('deposit', msg);
                depositingRef.current = false;
                return false;
            }
        },
        [walletAddress, network, fetchVaultData, toast, resetDeposit],
    );

    /** User clicked Confirm on deposit — resolves the Promise so deposit continues */
    const confirmDeposit = useCallback((): void => {
        const resolver = depositConfirmResolverRef.current;
        if (resolver !== null) {
            depositConfirmResolverRef.current = null;
            resolver();
        }
    }, []);

    // ── Withdraw ────────────────────────────────────────────────────────────

    const resetWithdraw = useCallback((): void => {
        setWithdrawError(null);
        removeVaultOp('withdraw');
    }, []);

    const withdraw = useCallback(
        async (tokenAddress: string, shares: bigint): Promise<boolean> => {
            if (walletAddress === null || walletAddress === undefined || network === null) {
                setWithdrawError('Connect your wallet first');
                return false;
            }

            setWithdrawError(null);
            const initSteps: TxStep[] = [makeStep('Withdraw tokens'), makeStep('Block confirmation')];
            addVaultOp({ type: 'withdraw', steps: initSteps, startedAt: Date.now(), walletAddress, awaitingConfirm: false });

            try {
                const sym = await autoVaultService.resolveTokenSymbol(tokenAddress);
                const dec = await autoVaultService.resolveTokenDecimals(tokenAddress);

                const shareFmt = formatTokenAmount(shares, dec);
                setVaultSteps('withdraw', [
                    makeStep(`Withdraw ${shareFmt} ${sym} shares`),
                    makeStep('Block confirmation'),
                ]);

                // Step 1: Withdraw (broadcast)
                patchVaultStep('withdraw', 0, { status: 'pending' });
                const { netAmount, txId } = await autoVaultService.withdraw(tokenAddress, shares, walletAddress, DEFAULT_FEE_RATE);
                patchVaultStep('withdraw', 0, { status: 'done', txId });

                const grossAmount = vaultInfo !== null && vaultInfo.totalShares > 0n
                    ? (shares * vaultInfo.totalStaked) / vaultInfo.totalShares
                    : netAmount;
                const fee = grossAmount - netAmount;
                const formattedNet = formatTokenAmount(netAmount, dec);

                addTxEntry('accept', null, txId, 'ok', `Withdraw ${formattedNet} ${sym} — awaiting confirmation`, walletAddress);
                toast('info', 'Withdrawal Sent!', `${formattedNet} ${sym} withdraw broadcast — waiting for block confirmation.`, '#pending-section');

                // Step 2: Wait for confirmation
                patchVaultStep('withdraw', 1, { status: 'pending' });
                await autoVaultService.waitForTransaction(txId);
                patchVaultStep('withdraw', 1, { status: 'done' });

                toast('success', 'Withdrawal Confirmed!', `Received ${formattedNet} ${sym} (fee: ${formatTokenAmount(fee, dec)} ${sym}).`, '#vault-history');

                addVaultHistoryEntry({
                    action: 'withdraw',
                    token: tokenAddress,
                    tokenSymbol: sym,
                    amount: netAmount,
                    fee,
                    shares,
                    txId,
                    timestamp: Date.now(),
                    walletAddress,
                });
                setHistory(historyEntries.filter((e) => e.walletAddress.toLowerCase() === walletAddress.toLowerCase()));

                removeVaultOp('withdraw');
                void fetchVaultData();
                return true;
            } catch (err) {
                console.error('[Vault] Withdraw error:', err);
                const msg = err instanceof Error ? err.message : 'Withdraw failed';
                setWithdrawError(msg);
                toast('error', 'Withdraw Failed', msg);
                markVaultStepsError('withdraw', msg);
                return false;
            }
        },
        [walletAddress, network, fetchVaultData, toast, vaultInfo],
    );

    // ── Compound ────────────────────────────────────────────────────────────

    const resetCompound = useCallback((): void => {
        setCompoundError(null);
        removeVaultOp('compound');
    }, []);

    const compound = useCallback(
        async (tokenAddress: string): Promise<boolean> => {
            if (walletAddress === null || walletAddress === undefined || network === null) {
                setCompoundError('Connect your wallet first');
                return false;
            }

            setCompoundError(null);
            const initSteps: TxStep[] = [makeStep('Compound rewards'), makeStep('Block confirmation')];
            addVaultOp({ type: 'compound', steps: initSteps, startedAt: Date.now(), walletAddress, awaitingConfirm: false });

            try {
                const sym = await autoVaultService.resolveTokenSymbol(tokenAddress);
                const dec = await autoVaultService.resolveTokenDecimals(tokenAddress);

                patchVaultStep('compound', 0, { status: 'pending' });
                const { compounded, txId } = await autoVaultService.compound(tokenAddress, walletAddress, DEFAULT_FEE_RATE);
                patchVaultStep('compound', 0, { status: 'done', txId });

                const feeBps = vaultInfo?.compoundFeeBps ?? 100n;
                const grossRewards = (compounded * 10000n) / (10000n - feeBps);
                const fee = grossRewards - compounded;
                const formattedAmt = formatTokenAmount(compounded, dec);

                addTxEntry('accept', null, txId, 'ok', `Compound ${formattedAmt} ${sym} — awaiting confirmation`, walletAddress);
                toast('info', 'Compound Sent!', `${formattedAmt} ${sym} compound broadcast — waiting for block confirmation.`, '#pending-section');

                patchVaultStep('compound', 1, { status: 'pending' });
                await autoVaultService.waitForTransaction(txId);
                patchVaultStep('compound', 1, { status: 'done' });

                toast('success', 'Compound Confirmed!', `${formattedAmt} ${sym} added to vault (fee: ${formatTokenAmount(fee, dec)} ${sym}).`, '#vault-history');

                addVaultHistoryEntry({
                    action: 'compound',
                    token: tokenAddress,
                    tokenSymbol: sym,
                    amount: compounded,
                    fee,
                    shares: 0n,
                    txId,
                    timestamp: Date.now(),
                    walletAddress,
                });
                setHistory(historyEntries.filter((e) => e.walletAddress.toLowerCase() === walletAddress.toLowerCase()));

                removeVaultOp('compound');
                void fetchVaultData();
                return true;
            } catch (err) {
                console.error('[Vault] Compound error:', err);
                const msg = err instanceof Error ? err.message : 'Compound failed';
                setCompoundError(msg);
                toast('error', 'Compound Failed', msg);
                markVaultStepsError('compound', msg);
                return false;
            }
        },
        [walletAddress, network, fetchVaultData, toast, vaultInfo],
    );

    // ── Admin: Fund Rewards ─────────────────────────────────────────────────

    const resetFund = useCallback((): void => {
        fundConfirmResolverRef.current = null;
        fundingRef.current = false;
        fundParamsRef.current = null;
        setFundError(null);
        removeVaultOp('fund');
    }, []);

    const fundRewards = useCallback(
        async (tokenAddress: string, amount: bigint): Promise<boolean> => {
            if (fundingRef.current) return false;
            if (walletAddress === null || walletAddress === undefined || network === null) return false;

            fundingRef.current = true;
            setFundError(null);

            try {
                const sym = await autoVaultService.resolveTokenSymbol(tokenAddress);
                const dec = await autoVaultService.resolveTokenDecimals(tokenAddress);
                const formattedAmt = formatTokenAmount(amount, dec);

                fundParamsRef.current = { tokenAddress, amount, sym, dec, formattedAmt };

                const initFundSteps: TxStep[] = [
                    makeStep(`Approve ${formattedAmt} ${sym}`),
                    makeStep('Approve confirmation'),
                    makeStep(`Fund ${formattedAmt} ${sym}`),
                    makeStep('Fund confirmation'),
                ];
                const storedFp: StoredFundParams = { tokenAddress, amount: amount.toString(), sym, dec, formattedAmt };
                addVaultOp({ type: 'fund', steps: initFundSteps, startedAt: Date.now(), walletAddress, awaitingConfirm: false, fundParams: storedFp });

                // Step 1: Approve
                patchVaultStep('fund', 0, { status: 'pending' });
                const approveTxId = await autoVaultService.approveToken(tokenAddress, amount, walletAddress, DEFAULT_FEE_RATE);
                patchVaultStep('fund', 0, { status: 'done', txId: approveTxId });
                addTxEntry('approve', null, approveTxId, 'ok', `Approve ${formattedAmt} ${sym} for Reward Pool`, walletAddress);
                toast('info', 'Approval sent!', `${formattedAmt} ${sym} — tx: ${approveTxId.slice(0, 10)}… — Waiting for block confirmation.`, '#pending-section');

                // Step 2: Wait for approve confirmation
                patchVaultStep('fund', 1, { status: 'pending' });
                await autoVaultService.waitForTransaction(approveTxId);
                patchVaultStep('fund', 1, { status: 'done' });
                toast('info', 'Approval confirmed!', `Click Confirm to fund ${formattedAmt} ${sym}.`, '#pending-section');

                // ── HARD PAUSE: await user click on Confirm button ──
                setVaultAwaitingConfirm('fund', true);
                setTimeout(() => {
                    const el = document.getElementById('pending-section');
                    if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 150);

                const confirmed = await new Promise<boolean>((resolve) => {
                    fundConfirmResolverRef.current = () => { resolve(true); };
                });
                if (!confirmed) {
                    resetFund();
                    return false;
                }

                setVaultAwaitingConfirm('fund', false);

                // Step 3: Fund rewards
                patchVaultStep('fund', 2, { status: 'pending' });
                const txId = await autoVaultService.fundRewards(tokenAddress, amount, walletAddress, DEFAULT_FEE_RATE);
                patchVaultStep('fund', 2, { status: 'done', txId });
                addTxEntry('create', null, txId, 'ok', `Fund Reward Pool — ${formattedAmt} ${sym}`, walletAddress);
                toast('info', 'Fund Sent!', `${formattedAmt} ${sym} broadcast — waiting for block confirmation.`, '#pending-section');

                // Step 4: Wait for fund confirmation
                patchVaultStep('fund', 3, { status: 'pending' });
                await autoVaultService.waitForTransaction(txId);
                patchVaultStep('fund', 3, { status: 'done' });

                toast('success', 'Fund Confirmed!', `${formattedAmt} ${sym} reward pool funded on-chain.`, '#vault-history');

                addVaultHistoryEntry({
                    action: 'fund',
                    token: tokenAddress,
                    tokenSymbol: sym,
                    amount,
                    fee: 0n,
                    shares: 0n,
                    txId,
                    timestamp: Date.now(),
                    walletAddress,
                });
                setHistory(historyEntries.filter((e) => e.walletAddress.toLowerCase() === walletAddress.toLowerCase()));

                removeVaultOp('fund');
                fundingRef.current = false;
                fundParamsRef.current = null;
                fundConfirmResolverRef.current = null;
                void fetchVaultData();
                return true;
            } catch (err) {
                console.error('[Vault] Fund error:', err);
                const msg = err instanceof Error ? err.message : 'Failed to fund rewards';
                setFundError(msg);
                addTxEntry('create', null, '', 'error', `Fund Reward Pool failed: ${msg}`, walletAddress);
                toast('error', 'Fund Failed', msg);
                markVaultStepsError('fund', msg);
                fundingRef.current = false;
                fundConfirmResolverRef.current = null;
                return false;
            }
        },
        [walletAddress, network, toast, fetchVaultData, resetFund],
    );

    /** User clicked Confirm — resolves the Promise so fundRewards continues */
    const confirmFund = useCallback((): void => {
        const resolver = fundConfirmResolverRef.current;
        if (resolver !== null) {
            fundConfirmResolverRef.current = null;
            resolver();
        }
    }, []);

    // ── Admin: Set Reward Rate ──────────────────────────────────────────────

    const setRewardRate = useCallback(
        async (tokenAddress: string, rate: bigint): Promise<boolean> => {
            if (walletAddress === null || walletAddress === undefined || network === null) return false;
            try {
                const txId = await autoVaultService.setRewardRate(tokenAddress, rate, walletAddress, DEFAULT_FEE_RATE);
                toast('success', 'Reward Rate Set!', `Rate updated — tx: ${txId.slice(0, 8)}...`);
                void fetchVaultData();
                return true;
            } catch (err) {
                toast('error', 'Set Rate Failed', err instanceof Error ? err.message : 'Failed to set reward rate');
                return false;
            }
        },
        [walletAddress, network, fetchVaultData, toast],
    );

    // ── Admin: Set Fees ─────────────────────────────────────────────────────

    const setFees = useCallback(
        async (compoundFeeBps: bigint, withdrawFeeBps: bigint): Promise<boolean> => {
            if (walletAddress === null || walletAddress === undefined || network === null) return false;
            try {
                const txId = await autoVaultService.setFees(compoundFeeBps, withdrawFeeBps, walletAddress, DEFAULT_FEE_RATE);
                toast('success', 'Fees Updated!', `Compound: ${Number(compoundFeeBps) / 100}%, Withdraw: ${Number(withdrawFeeBps) / 100}% — tx: ${txId.slice(0, 8)}...`);
                void fetchVaultData();
                return true;
            } catch (err) {
                toast('error', 'Set Fees Failed', err instanceof Error ? err.message : 'Failed to set fees');
                return false;
            }
        },
        [walletAddress, network, fetchVaultData, toast],
    );

    // ── Pending metadata ────────────────────────────────────────────────────
    const pendingStartedAt = depositOp?.startedAt ?? withdrawOp?.startedAt ?? compoundOp?.startedAt ?? fundOp?.startedAt ?? Date.now();

    return {
        selectedToken,
        setSelectedToken,
        vaultInfo,
        userInfo,
        sharePrice,
        pendingRewards,
        feeRecipient,
        tokenBalance,
        currentBlock,
        loading,
        error,
        deposit,
        confirmDeposit,
        depositing,
        depositAwaitingConfirm,
        depositSteps,
        depositError,
        resetDeposit,
        withdraw,
        withdrawing,
        withdrawSteps,
        withdrawError,
        resetWithdraw,
        compound,
        compounding,
        compoundSteps,
        compoundError,
        resetCompound,
        fundRewards,
        confirmFund,
        funding,
        fundAwaitingConfirm,
        fundSteps,
        fundError,
        resetFund,
        setRewardRate,
        setFees,
        history,
        pendingStartedAt,
        fetchVaultData,
    };
}
