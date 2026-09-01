/**
 * usePwa.ts
 *
 * Handles everything PWA-related in one hook:
 *  - Service worker registration + update detection
 *  - Online/offline status with event listeners
 *  - Install prompt capture (beforeinstallprompt)
 *
 * Usage in a root layout or provider:
 *   const { isOnline, canInstall, install, updateAvailable } = usePwa();
 */

import { useEffect, useState, useCallback, useRef } from 'react';

interface UsePwaReturn {
    isOnline: boolean;
    canInstall: boolean;
    install: () => Promise<void>;
    updateAvailable: boolean;
    applyUpdate: () => void;
    swReady: boolean;
}

export function usePwa(): UsePwaReturn {
    const [isOnline, setIsOnline]             = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
    const [canInstall, setCanInstall]         = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [swReady, setSwReady]               = useState(false);

    const deferredPrompt  = useRef<Event & { prompt: () => Promise<void> } | null>(null);
    const waitingWorker   = useRef<ServiceWorker | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // ── Online / offline ──────────────────────────────────────────────
        const handleOnline = () => {
            setIsOnline(true);
        };

        const handleOffline = () => {
            setIsOnline(false);
        };

        if (typeof window !== 'undefined') window.addEventListener('online',  handleOnline);
        if (typeof window !== 'undefined') window.addEventListener('offline', handleOffline);

        // ── Install prompt ────────────────────────────────────────────────
        const handleInstallPrompt = (e: Event) => {
            e.preventDefault();
            deferredPrompt.current = e as Event & { prompt: () => Promise<void> };
            setCanInstall(true);
        };
        if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', handleInstallPrompt);

        // ── Service worker registration ───────────────────────────────────
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js', { scope: '/' })
                .then(reg => {
                    setSwReady(true);

                    // Detect update available
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        newWorker?.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                waitingWorker.current = newWorker;
                                setUpdateAvailable(true);
                            }
                        });
                    });

                    // Check for update immediately
                    reg.update();
                })
                .catch(err => console.warn('[usePwa] SW registration failed:', err));

        }

        return () => {
            window.removeEventListener('online',  handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
        };
    }, []);

    // ── Actions ───────────────────────────────────────────────────────────────

    const install = useCallback(async () => {
        if (!deferredPrompt.current) return;
        await deferredPrompt.current.prompt();
        deferredPrompt.current = null;
        setCanInstall(false);
    }, []);

    const applyUpdate = useCallback(() => {
        waitingWorker.current?.postMessage({ type: 'SKIP_WAITING' });
        setUpdateAvailable(false);
        if (typeof window !== 'undefined') window.location.reload();
    }, []);

    return { isOnline, canInstall, install, updateAvailable, applyUpdate, swReady };
}
