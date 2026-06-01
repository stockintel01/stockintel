/**
 * usePwa.ts
 *
 * Handles everything PWA-related in one hook:
 *  - Service worker registration + update detection
 *  - Online/offline status with event listeners
 *  - Background sync registration on reconnect
 *  - Install prompt capture (beforeinstallprompt)
 *  - Pending queue count from IndexedDB
 *
 * Usage in a root layout or provider:
 *   const { isOnline, canInstall, install, updateAvailable, pendingCount } = usePwa();
 */

import { useEffect, useState, useCallback, useRef } from 'react';

interface UsePwaReturn {
    isOnline: boolean;
    canInstall: boolean;
    install: () => Promise<void>;
    updateAvailable: boolean;
    applyUpdate: () => void;
    pendingCount: number;       // mutations queued while offline
    swReady: boolean;
}

const QUEUE_DB   = 'intellistock-queue';
const QUEUE_STORE = 'pending-mutations';

async function countPending(): Promise<number> {
    return new Promise((resolve) => {
        const req = indexedDB.open(QUEUE_DB, 1);
        req.onupgradeneeded = e => {
            (e.target as IDBOpenDBRequest).result
                .createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = e => {
            const db    = (e.target as IDBOpenDBRequest).result;
            const tx    = db.transaction(QUEUE_STORE, 'readonly');
            const count = tx.objectStore(QUEUE_STORE).count();
            count.onsuccess = () => resolve(count.result);
            count.onerror   = () => resolve(0);
        };
        req.onerror = () => resolve(0);
    });
}

export function usePwa(): UsePwaReturn {
    const [isOnline, setIsOnline]             = useState(true);
    const [canInstall, setCanInstall]         = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [pendingCount, setPendingCount]     = useState(0);
    const [swReady, setSwReady]               = useState(false);

    const deferredPrompt  = useRef<Event & { prompt: () => Promise<void> } | null>(null);
    const waitingWorker   = useRef<ServiceWorker | null>(null);

    // Poll pending queue count
    const refreshPending = useCallback(async () => {
        if (typeof indexedDB === 'undefined') return;
        setPendingCount(await countPending());
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // ── Online / offline ──────────────────────────────────────────────
        setIsOnline(navigator.onLine);

        const handleOnline = async () => {
            setIsOnline(true);
            // Trigger background sync to flush queued mutations
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                const reg = await navigator.serviceWorker.ready;
                try {
                    await (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } })
                        .sync.register('flush-mutations');
                } catch {
                    // Background sync not supported — SW will handle on next fetch
                }
            }
            setTimeout(refreshPending, 2000); // allow sync to complete
        };

        const handleOffline = () => {
            setIsOnline(false);
            refreshPending();
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

            // Listen for SW messages
            navigator.serviceWorker.addEventListener('message', (e) => {
                if (e.data?.type === 'SYNC_COMPLETE') refreshPending();
            });
        }

        refreshPending();

        return () => {
            window.removeEventListener('online',  handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
        };
    }, [refreshPending]);

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

    return { isOnline, canInstall, install, updateAvailable, applyUpdate, pendingCount, swReady };
}
