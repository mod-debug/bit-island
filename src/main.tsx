import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletConnectProvider } from '@btc-vision/walletconnect';
import App from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

const root = document.getElementById('root');
if (root === null) throw new Error('Root element not found');

createRoot(root).render(
    <StrictMode>
        <ErrorBoundary>
            <WalletConnectProvider theme="dark">
                <ErrorBoundary>
                    <App />
                </ErrorBoundary>
            </WalletConnectProvider>
        </ErrorBoundary>
    </StrictMode>,
);
