import { useState, useCallback, useEffect } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { networks } from '@btc-vision/bitcoin';
import type { Address } from '@btc-vision/transaction';
import { getContract, BitcoinAbiTypes, ABIDataTypes } from 'opnet';
import type { BitcoinInterfaceAbi, BaseContractProperties } from 'opnet';
import { deployContract } from '../services/ContractDeployService.js';
import { ADMIN_WALLET, getNoSmileAddress, getNFTEscrowAddress, getAutoVaultAddress } from '../config/contracts.js';
import type { DeploymentResult } from '../types/index.js';

const OPSCAN_BASE = 'https://opscan.org';
const OPSCAN_NET = 'op_testnet';

/** Minimal ABI for NoSmileNFT batchMint */
const NOSMILE_MINT_ABI: BitcoinInterfaceAbi = [
    {
        name: 'batchMint',
        inputs: [
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'startId', type: ABIDataTypes.UINT256 },
            { name: 'count', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
];

interface INoSmileMintContract extends BaseContractProperties {
    batchMint(to: Address, startId: bigint, count: bigint): Promise<unknown>;
}

function shortAddr(addr: string): string {
    if (addr.length <= 16) return addr;
    return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

function CopyButton({ text }: { text: string }): React.JSX.Element {
    const [copied, setCopied] = useState(false);
    const copy = (): void => {
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => { setCopied(false); }, 2000);
        });
    };
    return (
        <button className="btn btn--ghost btn--xs" onClick={copy} title="Copy to clipboard">
            {copied ? '✓' : '⧉'}
        </button>
    );
}

interface DeployResultDisplayProps {
    result: DeploymentResult;
    label: string;
}

function DeployResultDisplay({ result, label }: DeployResultDisplayProps): React.JSX.Element {
    return (
        <div className="deploy-card__result">
            <div className="deploy-card__result-icon">&#127881;</div>
            <h3 className="deploy-card__result-title">{label} Deployed!</h3>
            <div className="deploy-card__result-details">
                <div className="success-detail">
                    <span className="success-detail__label">Contract Address</span>
                    <span className="success-detail__value monospace">
                        {shortAddr(result.contractAddress)}
                        <CopyButton text={result.contractAddress} />
                    </span>
                </div>
                <div className="success-detail">
                    <span className="success-detail__label">Funding TX</span>
                    <span className="success-detail__value monospace">
                        {shortAddr(result.fundingTxId)}
                        <CopyButton text={result.fundingTxId} />
                        <a
                            href={`${OPSCAN_BASE}/transactions/${result.fundingTxId}?network=${OPSCAN_NET}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="deploy-card__link"
                        >
                            OPScan
                        </a>
                    </span>
                </div>
                <div className="success-detail">
                    <span className="success-detail__label">Deploy TX</span>
                    <span className="success-detail__value monospace">
                        {shortAddr(result.deployTxId)}
                        <CopyButton text={result.deployTxId} />
                        <a
                            href={`${OPSCAN_BASE}/transactions/${result.deployTxId}?network=${OPSCAN_NET}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="deploy-card__link"
                        >
                            OPScan
                        </a>
                    </span>
                </div>
            </div>
        </div>
    );
}

/** Try to get a deployed address, return null if placeholder. */
function tryGetDeployed(getter: () => string): string | null {
    try {
        return getter();
    } catch {
        return null;
    }
}

export function DeployPage(): React.JSX.Element {
    const { walletAddress, address, provider, network, openConnectModal } = useWalletConnect();

    const activeNetwork = network ?? networks.opnetTestnet;
    const existingNoSmile = tryGetDeployed(() => getNoSmileAddress(activeNetwork));
    const existingEscrow = tryGetDeployed(() => getNFTEscrowAddress(activeNetwork));
    const existingAutoVault = tryGetDeployed(() => getAutoVaultAddress(activeNetwork));

    // NoSmileNFT state
    const [nftDeploying, setNftDeploying] = useState(false);
    const [nftResult, setNftResult] = useState<DeploymentResult | null>(null);
    const [nftError, setNftError] = useState<string | null>(null);

    // NFTEscrow state
    const [escrowDeploying, setEscrowDeploying] = useState(false);
    const [escrowResult, setEscrowResult] = useState<DeploymentResult | null>(null);
    const [escrowError, setEscrowError] = useState<string | null>(null);

    // AutoVault state
    const [vaultDeploying, setVaultDeploying] = useState(false);
    const [vaultResult, setVaultResult] = useState<DeploymentResult | null>(null);
    const [vaultError, setVaultError] = useState<string | null>(null);

    // Mint state
    const [minting, setMinting] = useState(false);
    const [mintTxId, setMintTxId] = useState<string | null>(null);
    const [mintError, setMintError] = useState<string | null>(null);
    const [mintAddress, setMintAddress] = useState(existingNoSmile ?? '');

    // Effective deployed addresses (from config or freshly deployed)
    const noSmileAddr = nftResult?.contractAddress ?? existingNoSmile;
    const escrowAddr = escrowResult?.contractAddress ?? existingEscrow;
    const autoVaultAddr = vaultResult?.contractAddress ?? existingAutoVault;

    // Auto-update mint address when a fresh deployment succeeds
    useEffect(() => {
        if (nftResult?.contractAddress !== undefined) {
            setMintAddress(nftResult.contractAddress);
        }
    }, [nftResult?.contractAddress]);

    const walletConnected = walletAddress !== null && walletAddress !== undefined;
    const isAdmin = walletConnected && walletAddress.toLowerCase() === ADMIN_WALLET.toLowerCase();

    const handleDeployAutoVault = useCallback(async (): Promise<void> => {
        if (!walletConnected || provider === null || provider === undefined || address === null) return;
        setVaultDeploying(true);
        setVaultError(null);
        try {
            // onDeployment reads calldata.readAddress() — pass the wallet's 32-byte address
            const calldata = new Uint8Array(address);
            const result = await deployContract('./AutoVault.wasm', walletAddress, provider, calldata);
            setVaultResult(result);
        } catch (err: unknown) {
            setVaultError(err instanceof Error ? err.message : 'Deployment failed');
        } finally {
            setVaultDeploying(false);
        }
    }, [walletAddress, address, provider, walletConnected]);

    const handleDeployNoSmile = useCallback(async (): Promise<void> => {
        if (!walletConnected || provider === null || provider === undefined) return;
        setNftDeploying(true);
        setNftError(null);
        try {
            const result = await deployContract('./NoSmileNFT.wasm', walletAddress, provider);
            setNftResult(result);
        } catch (err: unknown) {
            setNftError(err instanceof Error ? err.message : 'Deployment failed');
        } finally {
            setNftDeploying(false);
        }
    }, [walletAddress, provider, walletConnected]);

    const handleDeployEscrow = useCallback(async (): Promise<void> => {
        if (!walletConnected || provider === null || provider === undefined) return;
        setEscrowDeploying(true);
        setEscrowError(null);
        try {
            const result = await deployContract('./NFTEscrow.wasm', walletAddress, provider);
            setEscrowResult(result);
        } catch (err: unknown) {
            setEscrowError(err instanceof Error ? err.message : 'Deployment failed');
        } finally {
            setEscrowDeploying(false);
        }
    }, [walletAddress, provider, walletConnected]);

    const handleMintNfts = useCallback(async (): Promise<void> => {
        if (!walletConnected || provider === null || provider === undefined || network === null || address === null || mintAddress.trim().length < 10) return;
        setMinting(true);
        setMintError(null);
        try {
            const activeNetwork = network ?? networks.opnetTestnet;
            const contract = getContract<INoSmileMintContract>(
                mintAddress.trim(),
                NOSMILE_MINT_ABI,
                provider,
                activeNetwork,
                address,
            );

            const sim = await contract.batchMint(address, 1n, 10n);

            if (sim !== null && typeof sim === 'object' && 'error' in sim) {
                const errorResult = sim as { error: string };
                throw new Error(errorResult.error);
            }

            const sendable = sim as { sendTransaction: (params: Record<string, unknown>) => Promise<{ transactionId: string }> };
            const receipt = await sendable.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 200000n,
                feeRate: 10,
                network: activeNetwork,
            });

            setMintTxId(receipt.transactionId);
        } catch (err: unknown) {
            setMintError(err instanceof Error ? err.message : 'Minting failed');
        } finally {
            setMinting(false);
        }
    }, [walletAddress, address, provider, network, mintAddress, walletConnected]);

    // Not connected
    if (!walletConnected) {
        return (
            <main className="deploy-page">
                <div className="section-header">
                    <div className="section-tag">Admin</div>
                    <h2 className="section-title">Contract <span className="text-accent">Deploy</span></h2>
                </div>
                <div className="offers-empty">
                    <span className="offers-empty__icon">&#128274;</span>
                    <p className="offers-empty__text">Connect your admin wallet to deploy contracts.</p>
                    <button className="btn btn--primary" onClick={openConnectModal}>
                        Connect Wallet
                    </button>
                </div>
            </main>
        );
    }

    // Not admin
    if (!isAdmin) {
        return (
            <main className="deploy-page">
                <div className="section-header">
                    <div className="section-tag">Admin</div>
                    <h2 className="section-title">Contract <span className="text-accent">Deploy</span></h2>
                </div>
                <div className="offers-empty">
                    <span className="offers-empty__icon">&#128683;</span>
                    <p className="offers-empty__text">Admin access only.</p>
                    <p className="offers-empty__sub">This page is restricted to the project admin wallet.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="deploy-page">
            <div className="section-header">
                <div className="section-tag">Admin</div>
                <h2 className="section-title">
                    Contract <span className="text-accent">Deploy Station</span>
                </h2>
                <p className="section-sub">
                    Deploy NFT contracts to OPNet testnet. Each deployment requires 2 wallet signatures (funding + deploy).
                </p>
            </div>

            <div className="deploy-grid">
                {/* ── Card 1: NoSmileNFT ── */}
                <div className="deploy-card">
                    <div className="deploy-card__header">
                        <h3 className="deploy-card__title">NoSmileNFT</h3>
                        <span className="nft-offer-badge nft-offer-badge--op721">OP-721</span>
                    </div>
                    <div className="deploy-card__info">
                        <div className="deploy-card__row">
                            <span className="deploy-card__label">Name</span>
                            <span className="deploy-card__value">No Smile</span>
                        </div>
                        <div className="deploy-card__row">
                            <span className="deploy-card__label">Symbol</span>
                            <span className="deploy-card__value">NOSML</span>
                        </div>
                        <div className="deploy-card__row">
                            <span className="deploy-card__label">Max Supply</span>
                            <span className="deploy-card__value">10,000</span>
                        </div>
                        <div className="deploy-card__row">
                            <span className="deploy-card__label">WASM</span>
                            <span className="deploy-card__value">NoSmileNFT.wasm (43 KB)</span>
                        </div>
                    </div>

                    {/* Deploy status */}
                    {noSmileAddr !== null ? (
                        <div className="deploy-card__deployed">
                            <span className="deploy-card__deployed-badge">Deployed</span>
                            <code className="deploy-card__deployed-addr">{noSmileAddr}</code>
                            <CopyButton text={noSmileAddr} />
                        </div>
                    ) : (
                        <>
                            {nftError !== null && (
                                <div className="alert alert--error">{nftError}</div>
                            )}
                            <button
                                className="btn btn--primary btn--full btn--lg"
                                onClick={() => { void handleDeployNoSmile(); }}
                                disabled={nftDeploying}
                            >
                                {nftDeploying ? (
                                    <><span className="btn__spinner" /> Deploying NoSmileNFT...</>
                                ) : (
                                    'Deploy NoSmileNFT on Testnet'
                                )}
                            </button>
                            <p className="form-disclaimer">2 signatures required: funding TX + deploy TX</p>
                        </>
                    )}

                    {nftResult !== null && (
                        <DeployResultDisplay result={nftResult} label="NoSmileNFT" />
                    )}

                    {/* Mint section — always visible when contract is deployed */}
                    {noSmileAddr !== null && (
                        <div className="deploy-card__mint">
                            <h4 className="deploy-card__mint-title">Mint Test NFTs</h4>
                            <p className="deploy-card__mint-desc">
                                Mint NFTs #1 through #10 to your wallet for testing.
                            </p>
                            <div className="form-group" style={{ marginBottom: '12px' }}>
                                <label className="form-label">NFT Contract Address</label>
                                <input
                                    className="form-input form-input--mono"
                                    type="text"
                                    value={mintAddress}
                                    onChange={(e) => { setMintAddress(e.target.value); }}
                                    placeholder="opt1s..."
                                />
                            </div>

                            {mintTxId !== null ? (
                                <div className="deploy-card__mint-success">
                                    <span>10 NFTs minted!</span>
                                    <a
                                        href={`${OPSCAN_BASE}/transactions/${mintTxId}?network=${OPSCAN_NET}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        View on OPScan
                                    </a>
                                </div>
                            ) : (
                                <button
                                    className="btn btn--accent btn--full"
                                    onClick={() => { void handleMintNfts(); }}
                                    disabled={minting || mintAddress.trim().length < 10}
                                >
                                    {minting ? <><span className="btn__spinner" /> Minting...</> : 'Mint 10 NFTs to My Wallet'}
                                </button>
                            )}

                            {mintError !== null && (
                                <div className="alert alert--error" style={{ marginTop: '8px' }}>{mintError}</div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Card 2: NFTEscrow ── */}
                <div className="deploy-card">
                    <div className="deploy-card__header">
                        <h3 className="deploy-card__title">NFTEscrow</h3>
                        <span className="nft-offer-badge nft-offer-badge--nft-nft">Escrow</span>
                    </div>
                    <div className="deploy-card__info">
                        <div className="deploy-card__row">
                            <span className="deploy-card__label">Type</span>
                            <span className="deploy-card__value">NFT Escrow Contract</span>
                        </div>
                        <div className="deploy-card__row">
                            <span className="deploy-card__label">Supports</span>
                            <span className="deploy-card__value">NFT-NFT, NFT-Token, Token-NFT</span>
                        </div>
                        <div className="deploy-card__row">
                            <span className="deploy-card__label">WASM</span>
                            <span className="deploy-card__value">NFTEscrow.wasm (24 KB)</span>
                        </div>
                    </div>

                    {escrowAddr !== null ? (
                        <div className="deploy-card__deployed">
                            <span className="deploy-card__deployed-badge">Deployed</span>
                            <code className="deploy-card__deployed-addr">{escrowAddr}</code>
                            <CopyButton text={escrowAddr} />
                        </div>
                    ) : (
                        <>
                            {escrowError !== null && (
                                <div className="alert alert--error">{escrowError}</div>
                            )}
                            <button
                                className="btn btn--primary btn--full btn--lg"
                                onClick={() => { void handleDeployEscrow(); }}
                                disabled={escrowDeploying}
                            >
                                {escrowDeploying ? (
                                    <><span className="btn__spinner" /> Deploying NFTEscrow...</>
                                ) : (
                                    'Deploy NFTEscrow on Testnet'
                                )}
                            </button>
                            <p className="form-disclaimer">2 signatures required: funding TX + deploy TX</p>
                        </>
                    )}

                    {escrowResult !== null && (
                        <DeployResultDisplay result={escrowResult} label="NFTEscrow" />
                    )}
                </div>

                {/* ── Card 3: AutoVault ── */}
                <div className="deploy-card">
                    <div className="deploy-card__header">
                        <h3 className="deploy-card__title">AutoVault</h3>
                        <span className="nft-offer-badge nft-offer-badge--op721">Vault</span>
                    </div>
                    <div className="deploy-card__info">
                        <div className="deploy-card__row">
                            <span className="deploy-card__label">Type</span>
                            <span className="deploy-card__value">Auto-Compound Vault</span>
                        </div>
                        <div className="deploy-card__row">
                            <span className="deploy-card__label">Features</span>
                            <span className="deploy-card__value">Deposit, Compound, Withdraw</span>
                        </div>
                        <div className="deploy-card__row">
                            <span className="deploy-card__label">WASM</span>
                            <span className="deploy-card__value">AutoVault.wasm (28 KB)</span>
                        </div>
                    </div>

                    {autoVaultAddr !== null ? (
                        <div className="deploy-card__deployed">
                            <span className="deploy-card__deployed-badge">Deployed</span>
                            <code className="deploy-card__deployed-addr">{autoVaultAddr}</code>
                            <CopyButton text={autoVaultAddr} />
                        </div>
                    ) : (
                        <>
                            {vaultError !== null && (
                                <div className="alert alert--error">{vaultError}</div>
                            )}
                            <button
                                className="btn btn--primary btn--full btn--lg"
                                onClick={() => { void handleDeployAutoVault(); }}
                                disabled={vaultDeploying}
                            >
                                {vaultDeploying ? (
                                    <><span className="btn__spinner" /> Deploying AutoVault...</>
                                ) : (
                                    'Deploy AutoVault on Testnet'
                                )}
                            </button>
                            <p className="form-disclaimer">2 signatures required: funding TX + deploy TX</p>
                        </>
                    )}

                    {vaultResult !== null && (
                        <DeployResultDisplay result={vaultResult} label="AutoVault" />
                    )}
                </div>
            </div>
        </main>
    );
}
