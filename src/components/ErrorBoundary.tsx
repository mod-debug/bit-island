// @ts-nocheck
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    // @ts-ignore
    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    override render(): ReactNode {
        if (this.state.error !== null) {
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', minHeight: '100vh', padding: '2rem',
                    background: '#0a0a0a', color: '#f87171', fontFamily: 'monospace',
                    gap: '1rem', textAlign: 'center',
                }}>
                    <span style={{ fontSize: '2rem' }}>&#9888;</span>
                    <strong>Something went wrong</strong>
                    <code style={{ fontSize: '0.8rem', color: '#aaa', maxWidth: '600px', wordBreak: 'break-all' }}>
                        {this.state.error.message}
                    </code>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '1rem', padding: '0.5rem 1.5rem',
                            background: '#f97316', color: '#fff', border: 'none',
                            borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem',
                        }}
                    >
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
