import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'btcmonkeys-theme';

/** Read saved theme from localStorage, default to 'dark' */
function getInitialTheme(): Theme {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* localStorage unavailable */ }
    return 'dark';
}

/**
 * Hook that manages the app theme (dark/light).
 * Persists choice in localStorage and applies `data-theme` to `<html>`.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
    const [theme, setTheme] = useState<Theme>(getInitialTheme);

    // Apply to DOM
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
    }, [theme]);

    const toggleTheme = useCallback((): void => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }, []);

    return { theme, toggleTheme };
}
