import { useState, useEffect, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { networks } from '@btc-vision/bitcoin';

const BLOCK_INTERVAL_MS = 10 * 60 * 1000; // ~10 minutes per block

function networkLabel(n: typeof networks.bitcoin | null): string {
    if (n === null) return 'NOT CONNECTED';
    if (n.bech32 === networks.bitcoin.bech32) return 'MAINNET';
    if (n.bech32 === networks.opnetTestnet.bech32) return 'OPNETTESTNET';
    if (n.bech32 === networks.regtest.bech32) return 'REGTEST';
    return 'UNKNOWN';
}

export function NetworkBar(): React.JSX.Element {
    const { provider, network } = useWalletConnect();
    const [blockNumber, setBlockNumber] = useState<bigint>(0n);
    const [countdown, setCountdown] = useState('');
    const lastBlockTime = useRef<number>(Date.now());

    // Fetch block number every 30s
    useEffect(() => {
        if (provider === null || provider === undefined) return;

        let cancelled = false;

        const fetchBlock = async (): Promise<void> => {
            try {
                const num = await provider.getBlockNumber();
                if (!cancelled) {
                    setBlockNumber((prev) => {
                        if (num !== prev) lastBlockTime.current = Date.now();
                        return num;
                    });
                }
            } catch {
                // ignore
            }
        };

        void fetchBlock();
        const id = setInterval(() => { void fetchBlock(); }, 30_000);
        return () => { cancelled = true; clearInterval(id); };
    }, [provider]);

    // Countdown timer
    useEffect(() => {
        const tick = (): void => {
            const elapsed = Date.now() - lastBlockTime.current;
            const remaining = Math.max(0, BLOCK_INTERVAL_MS - elapsed);
            const mins = Math.floor(remaining / 60_000);
            const secs = Math.floor((remaining % 60_000) / 1000);
            setCountdown(`~${mins.toString()}m ${secs.toString().padStart(2, '0')}s`);
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => { clearInterval(id); };
    }, [blockNumber]);

    const label = networkLabel(network);
    const isConnected = network !== null;

    return (
        <div className="network-bar">
            <div className="network-bar__item">
                <span className="network-bar__label">NETWORK</span>
                <span className="network-bar__value">
                    <span className={`network-bar__dot ${isConnected ? 'network-bar__dot--live' : ''}`} />
                    {label}
                </span>
            </div>
            <div className="network-bar__sep" />
            <div className="network-bar__item">
                <span className="network-bar__label">BLOCK</span>
                <span className="network-bar__value">
                    <span className="network-bar__btc-icon">&#8383;</span>
                    {blockNumber > 0n ? blockNumber.toLocaleString() : '—'}
                </span>
            </div>
            <div className="network-bar__sep" />
            <div className="network-bar__item">
                <span className="network-bar__label">NEXT BLOCK</span>
                <span className="network-bar__value">
                    <span className="network-bar__clock">&#9201;</span>
                    {blockNumber > 0n ? countdown : '—'}
                </span>
            </div>
        </div>
    );
}
