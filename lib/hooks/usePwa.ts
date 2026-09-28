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
    connectionStatus: 'checking' | 'online' | 'offline' | 'unreachable';
    canInstall: boolean;
    install: () => Promise<void>;
    updateAvailable: boolean;
    applyUpdate: () => void;
    swReady: boolean;
}

export function usePwa(): UsePwaReturn {
    const [connectionStatus, setConnectionStatus] = useState<UsePwaReturn['connectionStatus']>('checking');
    const [canInstall, setCanInstall]         = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [swReady, setSwReady]               = useState(false);

    const deferredPrompt  = useRef<Event & { prompt: () => Promise<void> } | null>(null);
    const waitingWorker   = useRef<ServiceWorker | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // ── Online / offline ──────────────────────────────────────────────
        // navigator.onLine can remain stale after sleep, VPN changes, or switching
        // networks. Confirm connectivity against an endpoint the service worker skips.
        let active = true;
        let probeController: AbortController | null = null;
        const checkConnectivity = async () => {
            probeController?.abort();
            const controller = new AbortController();
            probeController = controller;
            const timeout = window.setTimeout(() => controller.abort(), 5_000);

            try {
                const response = await fetch(`/api/connectivity?probe=${Date.now()}`, {
                    cache: 'no-store',
                    credentials: 'same-origin',
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error(`Connectivity check returned ${response.status}`);
                if (active && probeController === controller) setConnectionStatus('online');
            } catch {
                if (active && probeController === controller) {
                    setConnectionStatus(navigator.onLine ? 'unreachable' : 'offline');
                }
            } finally {
                window.clearTimeout(timeout);
                if (probeController === controller) probeController = null;
            }
        };

        const handleConnectivityChange = () => void checkConnectivity();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') void checkConnectivity();
        };

        void checkConnectivity();
        const probeInterval = window.setInterval(checkConnectivity, 30_000);
        window.addEventListener('online', handleConnectivityChange);
        window.addEventListener('offline', handleConnectivityChange);
        window.addEventListener('focus', handleConnectivityChange);
        window.addEventListener('pageshow', handleConnectivityChange);
        document.addEventListener('visibilitychange', handleVisibilityChange);

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
            active = false;
            probeController?.abort();
            window.clearInterval(probeInterval);
            window.removeEventListener('online', handleConnectivityChange);
            window.removeEventListener('offline', handleConnectivityChange);
            window.removeEventListener('focus', handleConnectivityChange);
            window.removeEventListener('pageshow', handleConnectivityChange);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
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

    return {
        isOnline: connectionStatus === 'online' || connectionStatus === 'checking',
        connectionStatus,
        canInstall,
        install,
        updateAvailable,
        applyUpdate,
        swReady,
    };
}
