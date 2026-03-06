import { useState, useEffect, useCallback, createContext, useContext } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
    readonly id: number;
    readonly type: ToastType;
    readonly title: string;
    readonly message: string | undefined;
    readonly anchor: string | undefined;
    exiting: boolean | undefined;
}

/** Persistent notification entry (kept in history) */
export interface NotificationEntry {
    readonly id: number;
    readonly type: ToastType;
    readonly title: string;
    readonly message: string | undefined;
    readonly timestamp: number;
    readonly anchor: string | undefined;
    /** 'continue-create' | 'continue-accept' = special action buttons */
    readonly action: string | undefined;
    read: boolean;
}

interface ToastContextValue {
    toast: (type: ToastType, title: string, message?: string, anchor?: string, action?: string) => void;
    notifications: NotificationEntry[];
    unreadCount: number;
    markAllRead: () => void;
    clearNotifications: () => void;
}

const ToastContext = createContext<ToastContextValue>({
    toast: () => { /* noop */ },
    notifications: [],
    unreadCount: 0,
    markAllRead: () => { /* noop */ },
    clearNotifications: () => { /* noop */ },
});

/** Hook to show toast notifications and access notification history */
export function useToast(): ToastContextValue {
    return useContext(ToastContext);
}

const ICON_MAP: Record<ToastType, string> = {
    success: '\u2705',
    error: '\u274C',
    info: '\u2139\uFE0F',
};

const AUTO_DISMISS_MS = 5000;
const ERROR_DISMISS_MS = 12000;
const ANCHOR_DISMISS_MS = 30000;
const EXIT_ANIMATION_MS = 250;
const MAX_NOTIFICATIONS = 50;
const NOTIF_STORAGE_KEY = 'btcmonkeys-notifications';

function loadNotifications(): NotificationEntry[] {
    try {
        const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
        if (raw === null) return [];
        return JSON.parse(raw) as NotificationEntry[];
    } catch { return []; }
}

function saveNotifications(entries: NotificationEntry[]): void {
    try {
        localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(entries));
    } catch { /* quota exceeded */ }
}

let nextId = 0;

/** Extract an anchor link from the toast title/message if not explicitly provided */
function extractAnchor(title: string, message: string | undefined): string | undefined {
    const combined = `${title} ${message ?? ''}`;
    if (combined.toLowerCase().includes('posted') || combined.toLowerCase().includes('created')) return '#pending';
    if (combined.toLowerCase().includes('cancel')) return '#browse';
    if (combined.toLowerCase().includes('accept')) return '#browse';
    const match = combined.match(/Offer\s*#(\d+)/i) ?? combined.match(/Deal\s*#?(\d+)/i);
    if (match !== null) return '#browse';
    return undefined;
}

/** Provider that renders the toast container. Wrap your app with this. */
export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [notifications, setNotifications] = useState<NotificationEntry[]>(loadNotifications);

    // Persist notifications to localStorage on every change
    useEffect(() => {
        saveNotifications(notifications);
    }, [notifications]);

    const removeToast = useCallback((id: number): void => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, EXIT_ANIMATION_MS);
    }, []);

    const addToast = useCallback((type: ToastType, title: string, message?: string, anchor?: string, action?: string): void => {
        const id = ++nextId;
        const resolvedAnchorEarly = anchor ?? extractAnchor(title, message);
        setToasts((prev) => [...prev, { id, type, title, message, exiting: undefined, anchor: resolvedAnchorEarly }]);
        const delay = resolvedAnchorEarly !== undefined ? ANCHOR_DISMISS_MS : type === 'error' ? ERROR_DISMISS_MS : AUTO_DISMISS_MS;
        setTimeout(() => { removeToast(id); }, delay);

        // Add to persistent notification history
        const resolvedAnchor = anchor ?? extractAnchor(title, message);
        setNotifications((prev) => {
            const entry: NotificationEntry = {
                id,
                type,
                title,
                message,
                timestamp: Date.now(),
                anchor: resolvedAnchor,
                action: action ?? undefined,
                read: false,
            };
            const updated = [entry, ...prev];
            if (updated.length > MAX_NOTIFICATIONS) return updated.slice(0, MAX_NOTIFICATIONS);
            return updated;
        });
    }, [removeToast]);

    const markAllRead = useCallback((): void => {
        setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
    }, []);

    const clearNotifications = useCallback((): void => {
        setNotifications([]);
    }, []);

    const unreadCount = notifications.filter((n) => !n.read).length;

    const contextValue: ToastContextValue = {
        toast: addToast,
        notifications,
        unreadCount,
        markAllRead,
        clearNotifications,
    };

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <div className="toast-container">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={[
                            'toast',
                            `toast--${t.type}`,
                            t.exiting === true ? 'toast--exiting' : '',
                        ].filter(Boolean).join(' ')}
                    >
                        <span className="toast__icon">{ICON_MAP[t.type]}</span>
                        <div className="toast__body">
                            <div className="toast__title">{t.title}</div>
                            {t.message !== undefined && (
                                <div className="toast__message">{t.message}</div>
                            )}
                            {t.anchor !== undefined && (
                                t.anchor === '#pending' ? (
                                    <button
                                        className="toast__link toast__link--pending"
                                        onClick={() => {
                                            const el = document.getElementById('pending-section');
                                            if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            removeToast(t.id);
                                        }}
                                    >
                                        View Transaction &rarr;
                                    </button>
                                ) : t.anchor.startsWith('http') ? (
                                    <a
                                        className="toast__link"
                                        href={t.anchor}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        View on OPScan &rarr;
                                    </a>
                                ) : (
                                    <button
                                        className="toast__link"
                                        onClick={() => {
                                            const el = document.querySelector(t.anchor ?? '');
                                            if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            removeToast(t.id);
                                        }}
                                    >
                                        View &rarr;
                                    </button>
                                )
                            )}
                        </div>
                        <button
                            className="toast__close"
                            onClick={() => { removeToast(t.id); }}
                            aria-label="Dismiss"
                        >
                            &times;
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

/** Standalone function to show toasts — for use in services outside React tree */
let globalToastFn: ((type: ToastType, title: string, message?: string, anchor?: string, action?: string) => void) | null = null;

export function registerGlobalToast(fn: typeof globalToastFn): void {
    globalToastFn = fn;
}

export function showToast(type: ToastType, title: string, message?: string): void {
    if (globalToastFn !== null) {
        globalToastFn(type, title, message);
    }
}

/** Bridge component — place inside ToastProvider to register global toast */
export function ToastBridge(): null {
    const { toast } = useToast();
    useEffect(() => {
        registerGlobalToast(toast);
        return () => { registerGlobalToast(null); };
    }, [toast]);
    return null;
}
