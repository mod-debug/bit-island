import { useState, useRef, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useTheme } from '../hooks/useTheme.js';
import { useToast, type NotificationEntry } from './Toast.js';
import { useOTCEscrow } from '../hooks/useOTCEscrow.js';
import { useTokenBalances } from '../hooks/useTokenBalances.js';
import { NetworkBar } from './NetworkBar.js';
import { formatTokenAmount } from '../utils/tokenAmount.js';
import { nftEscrowService } from '../services/NFTEscrowService.js';
import { getNFTEscrowAddress } from '../config/contracts.js';
import { getKnownCollections, findCollectionByAddress } from '../config/nftCollections.js';
import { generateNftImage, collectionToSeed } from '../utils/generateNftImage.js';

function formatAddress(addr: string): string {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const NOTIF_ICONS: Record<string, string> = {
    success: '\u2705',
    error: '\u274C',
    info: '\u2139\uFE0F',
};

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins.toString()}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs.toString()}h ago`;
    return `${Math.floor(hrs / 24).toString()}d ago`;
}

interface NotifItemProps {
    n: NotificationEntry;
    awaitingContinue: boolean;
    onContinue: () => void;
    onClose: () => void;
}

function NotifItem({ n, awaitingContinue, onContinue, onClose }: NotifItemProps): React.JSX.Element {
    const isContinueAction = n.action === 'continue' && awaitingContinue;

    const handleContinueClick = (): void => {
        // Scroll to section first
        if (n.anchor !== undefined) {
            const el = document.querySelector(n.anchor);
            if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Trigger the continue
        onContinue();
        onClose();
    };

    return (
        <li className={`notif-item ${n.read ? '' : 'notif-item--unread'} ${isContinueAction ? 'notif-item--action' : ''}`}>
            <span className="notif-item__icon">{NOTIF_ICONS[n.type] ?? ''}</span>
            <div className="notif-item__body">
                <span className="notif-item__title">{n.title}</span>
                {n.message !== undefined && (
                    <span className="notif-item__msg">{n.message}</span>
                )}
                {isContinueAction ? (
                    <button className="notif-item__continue" onClick={handleContinueClick}>
                        Continue &mdash; Final Signature
                    </button>
                ) : n.anchor !== undefined ? (
                    n.anchor === '#pending' ? (
                        <button
                            className="notif-item__go notif-item__go--pending"
                            onClick={() => {
                                const el = document.getElementById('pending-section');
                                if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                onClose();
                            }}
                        >
                            View Transaction &rarr;
                        </button>
                    ) : (
                        <a href={n.anchor} className="notif-item__go" onClick={onClose}>
                            {n.action === 'continue' ? 'Sign \u2192' : '\uD83D\uDC12'}
                        </a>
                    )
                ) : null}
                <span className="notif-item__time">{timeAgo(n.timestamp)}</span>
            </div>
        </li>
    );
}

export function Navbar(): React.JSX.Element {
    const { walletAddress, network, openConnectModal, disconnect, connecting } = useWalletConnect();
    const { theme, toggleTheme } = useTheme();
    const { notifications, unreadCount, markAllRead, clearNotifications } = useToast();
    const { awaitingContinue, confirmContinue } = useOTCEscrow();
    const { balances, loading: balancesLoading, refresh: refreshBalances } = useTokenBalances();
    const location = useLocation();
    const currentPage =
        location.pathname === '/otc' ? 'otc'
        : location.pathname === '/vesting' ? 'vesting'
        : location.pathname === '/vault' ? 'vault'
        : 'hub';
    const [open, setOpen] = useState(false);
    const [walletOpen, setWalletOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const walletRef = useRef<HTMLDivElement>(null);

    // NFT state for wallet dropdown — grouped by collection
    interface NftEntry { readonly tokenId: bigint; image: string }
    interface CollectionFolder { readonly address: string; readonly items: NftEntry[] }
    const [nftFolders, setNftFolders] = useState<CollectionFolder[]>([]);
    const [nftsLoading, setNftsLoading] = useState(false);
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

    const toggleDropdown = (): void => {
        const willOpen = !open;
        setOpen(willOpen);
        if (willOpen) markAllRead();
    };

    const closeDropdown = (): void => { setOpen(false); };

    const toggleFolder = (addr: string): void => {
        setOpenFolders((prev) => {
            const next = new Set(prev);
            if (next.has(addr)) next.delete(addr);
            else next.add(addr);
            return next;
        });
    };

    const fetchNfts = (): void => {
        if (walletAddress === null || walletAddress === undefined || network === null) return;
        const collections = getKnownCollections(network);
        if (collections.length === 0) return;

        try {
            const escrowAddr = getNFTEscrowAddress(network);
            nftEscrowService.initialize(escrowAddr, network);
        } catch { return; }

        setNftsLoading(true);

        void (async () => {
            const folders: CollectionFolder[] = [];
            for (const col of collections) {
                try {
                    const tokenIds = await nftEscrowService.getNftOwnerTokens(col.address, walletAddress);
                    const seed = collectionToSeed(col.address);
                    const items: NftEntry[] = tokenIds.map((tid) => ({
                        tokenId: tid,
                        image: generateNftImage(tid, seed, 64),
                    }));
                    folders.push({ address: col.address, items });
                } catch {
                    folders.push({ address: col.address, items: [] });
                }
            }
            setNftFolders(folders);
            setNftsLoading(false);

            // Async upgrade to real images
            for (const folder of folders) {
                for (const entry of folder.items) {
                    nftEscrowService.resolveNftImage(folder.address, entry.tokenId).then((url) => {
                        if (url !== null) {
                            setNftFolders((prev) =>
                                prev.map((f) => {
                                    if (f.address !== folder.address) return f;
                                    return {
                                        ...f,
                                        items: f.items.map((n) =>
                                            n.tokenId === entry.tokenId ? { ...n, image: url } : n,
                                        ),
                                    };
                                }),
                            );
                        }
                    }, () => { /* skip */ });
                }
            }
        })();
    };

    const toggleWalletDropdown = (): void => {
        const willOpen = !walletOpen;
        setWalletOpen(willOpen);
        if (willOpen) {
            void refreshBalances();
            fetchNfts();
        }
    };

    // Close on outside click — notifications
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent): void => {
            if (dropdownRef.current !== null && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => { document.removeEventListener('mousedown', handler); };
    }, [open]);

    // Close on outside click — wallet dropdown
    useEffect(() => {
        if (!walletOpen) return;
        const handler = (e: MouseEvent): void => {
            if (walletRef.current !== null && !walletRef.current.contains(e.target as Node)) {
                setWalletOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => { document.removeEventListener('mousedown', handler); };
    }, [walletOpen]);

    return (
        <nav className="navbar">
            <Link to="/" className="navbar__logo">
                <span className="navbar__logo-text">
                    <span className="btc-b">&#8383;</span>it- <span className="navbar__logo-accent">Island</span>
                </span>
            </Link>

            <div className="navbar__links">
                <div className="navbar__page-switcher">
                    <Link to="/otc" className={`navbar__page-link ${currentPage === 'otc' ? 'navbar__page-link--active' : ''}`}>
                        Bit OTC Escrow
                    </Link>
                    <Link to="/vault" className={`navbar__page-link navbar__page-link--launch ${currentPage === 'vault' ? 'navbar__page-link--active navbar__page-link--launch-active' : ''}`}>
                        Revenue Vault
                    </Link>
                    <Link to="/vesting" className={`navbar__page-link navbar__page-link--vest ${currentPage === 'vesting' ? 'navbar__page-link--active navbar__page-link--vest-active' : ''}`}>
                        Vesting Dashboard
                    </Link>
                </div>
                {currentPage === 'otc' ? (
                    <>
                        <a href="#browse" className="navbar__link">Marketplace</a>
                        <a href="#create" className="navbar__link">Post Deal</a>
                        <a href="#about" className="navbar__link">About</a>
                    </>
                ) : currentPage === 'vault' ? (
                    <>
                        <a href="#av-deposit" className="navbar__link">Deposit</a>
                        <a href="#av-deposit" className="navbar__link">Withdraw</a>
                        <a href="#av-history" className="navbar__link">History</a>
                    </>
                ) : currentPage === 'vesting' ? (
                    <>
                        <a href="#vest-browse" className="navbar__link">Schedules</a>
                        <a href="#vest-create" className="navbar__link">Create</a>
                        <a href="#vest-calendar" className="navbar__link">Calendar</a>
                    </>
                ) : null}
            </div>

            <div className="navbar__right">
                <button
                    className="theme-toggle"
                    onClick={toggleTheme}
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {theme === 'dark' ? '\u2600' : '\uD83C\uDF19'}
                </button>

                {/* Notification bell */}
                <div className="notif-bell-wrap" ref={dropdownRef}>
                    <button
                        className={`notif-bell ${awaitingContinue ? 'notif-bell--pulse' : ''}`}
                        onClick={toggleDropdown}
                        title="Notifications"
                    >
                        <span className="notif-bell__icon">{'\uD83D\uDD14'}</span>
                        {unreadCount > 0 && (
                            <span className="notif-bell__badge">{unreadCount > 9 ? '9+' : unreadCount.toString()}</span>
                        )}
                    </button>

                    {open && (
                        <div className="notif-dropdown">
                            <div className="notif-dropdown__header">
                                <span className="notif-dropdown__title">Notifications</span>
                                {notifications.length > 0 && (
                                    <button className="notif-dropdown__clear" onClick={clearNotifications}>
                                        Clear all
                                    </button>
                                )}
                            </div>
                            {notifications.length === 0 ? (
                                <div className="notif-dropdown__empty">No notifications yet</div>
                            ) : (
                                <ul className="notif-dropdown__list">
                                    {notifications.map((n) => (
                                        <NotifItem
                                            key={n.id}
                                            n={n}
                                            awaitingContinue={awaitingContinue}
                                            onContinue={confirmContinue}
                                            onClose={closeDropdown}
                                        />
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                <div className="navbar__wallet" ref={walletRef}>
                    {walletAddress !== null && walletAddress !== undefined ? (
                        <div className="wallet-connected">
                            <button className="wallet-connected__toggle" onClick={toggleWalletDropdown}>
                                <span className="wallet-connected__dot" />
                                <span className="wallet-connected__address">{formatAddress(walletAddress)}</span>
                                <span className="wallet-connected__chevron">{walletOpen ? '\u25B2' : '\u25BC'}</span>
                            </button>
                            <button className="btn btn--outline btn--sm" onClick={disconnect}>
                                Disconnect
                            </button>

                            {walletOpen && (
                                <div className="wallet-dropdown">
                                    <div className="wallet-dropdown__header">Token Balances</div>
                                    {balancesLoading ? (
                                        <div className="wallet-dropdown__loading">
                                            <span className="btn__spinner" /> Loading...
                                        </div>
                                    ) : balances.length === 0 ? (
                                        <div className="wallet-dropdown__empty">No tokens found</div>
                                    ) : (
                                        <ul className="wallet-dropdown__list">
                                            {balances.map((b) => (
                                                <li key={b.token.address} className="wallet-dropdown__item">
                                                    {b.token.icon !== undefined ? (
                                                        <img
                                                            src={b.token.icon}
                                                            alt={b.token.symbol}
                                                            className="wallet-dropdown__icon"
                                                        />
                                                    ) : (
                                                        <span
                                                            className="wallet-dropdown__dot"
                                                            style={{ background: b.token.color }}
                                                        />
                                                    )}
                                                    <span className="wallet-dropdown__symbol">{b.token.symbol}</span>
                                                    <span className="wallet-dropdown__balance">
                                                        {formatTokenAmount(b.balance, b.token.decimals)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {/* NFT collections — collapsible folders */}
                                    <div className="wallet-dropdown__header">NFTs</div>
                                    {nftsLoading ? (
                                        <div className="wallet-dropdown__loading">
                                            <span className="btn__spinner" /> Loading...
                                        </div>
                                    ) : nftFolders.every((f) => f.items.length === 0) ? (
                                        <div className="wallet-dropdown__empty">No NFTs found</div>
                                    ) : (
                                        <div className="wallet-dropdown__nft-folders">
                                            {nftFolders.filter((f) => f.items.length > 0).map((folder) => {
                                                const col = findCollectionByAddress(folder.address, network!);
                                                const isOpen = openFolders.has(folder.address);
                                                return (
                                                    <div key={folder.address} className="nft-folder">
                                                        <button
                                                            className="nft-folder__header"
                                                            onClick={() => { toggleFolder(folder.address); }}
                                                        >
                                                            <img
                                                                src={generateNftImage(0n, collectionToSeed(folder.address), 32)}
                                                                alt={col?.name ?? ''}
                                                                className="nft-folder__icon"
                                                            />
                                                            <span className="nft-folder__name">
                                                                {col?.name ?? folder.address.slice(0, 10)}
                                                            </span>
                                                            <span className="nft-folder__count">
                                                                {folder.items.length.toString()}
                                                            </span>
                                                            <span className="nft-folder__chevron">
                                                                {isOpen ? '\u25B2' : '\u25BC'}
                                                            </span>
                                                        </button>
                                                        {isOpen && (
                                                            <div className="nft-folder__grid">
                                                                {folder.items.map((nft) => (
                                                                    <div
                                                                        key={nft.tokenId.toString()}
                                                                        className="wallet-dropdown__nft-item"
                                                                        title={`${col?.symbol ?? '???'} #${nft.tokenId.toString()}`}
                                                                    >
                                                                        <img
                                                                            src={nft.image}
                                                                            alt={`#${nft.tokenId.toString()}`}
                                                                            className="wallet-dropdown__nft-img"
                                                                        />
                                                                        <span className="wallet-dropdown__nft-id">
                                                                            #{nft.tokenId.toString()}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <button
                                        className="wallet-dropdown__refresh"
                                        onClick={() => { void refreshBalances(); fetchNfts(); }}
                                        disabled={balancesLoading || nftsLoading}
                                    >
                                        {balancesLoading || nftsLoading ? 'Refreshing...' : 'Refresh'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            className="btn btn--primary"
                            onClick={openConnectModal}
                            disabled={connecting}
                        >
                            {connecting ? <span className="btn__spinner" /> : 'Connect Wallet'}
                        </button>
                    )}
                </div>
            </div>
            <NetworkBar />
        </nav>
    );
}
