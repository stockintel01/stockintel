/**
 * IntelliStock AI — Service Worker
 * 
 * Strategy:
 *  - App shell (JS/CSS/fonts): Cache-first, fallback to network
 *  - API calls to Firestore: Network-first, fallback to cache
 *  - Navigation requests: Network-first, fallback to /offline
 *  - Static assets (images, icons): Cache-first, stale-while-revalidate
 * 
 * Offline queue: Failed POST/PATCH mutations are stored in IndexedDB
 * and replayed when connectivity is restored.
 */

const CACHE_NAME      = 'intellistock-v1';
const OFFLINE_URL     = '/offline';
const QUEUE_DB_NAME   = 'intellistock-queue';
const QUEUE_STORE     = 'pending-mutations';

const APP_SHELL = [
    '/',
    '/offline',
    '/dashboard',
    '/manifest.json',
];

// ─── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// ─── Activate: delete old caches ──────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ─── IndexedDB queue helpers ──────────────────────────────────────────────────
function openQueueDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(QUEUE_DB_NAME, 1);
        req.onupgradeneeded = e => {
            e.target.result.createObjectStore(QUEUE_STORE, {
                keyPath: 'id', autoIncrement: true,
            });
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = () => reject(req.error);
    });
}

async function enqueueRequest(request) {
    const body = await request.clone().text().catch(() => '');
    const entry = {
        url:     request.url,
        method:  request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body,
        timestamp: Date.now(),
    };
    const db    = await openQueueDb();
    const tx    = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).add(entry);
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

async function flushQueue() {
    const db    = await openQueueDb();
    const tx    = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const all   = await new Promise((res, rej) => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result);
        req.onerror   = () => rej(req.error);
    });

    for (const entry of all) {
        try {
            await fetch(entry.url, {
                method:  entry.method,
                headers: entry.headers,
                body:    entry.body || undefined,
            });
            store.delete(entry.id);
        } catch {
            // Still offline — leave in queue
        }
    }
}

// ─── Background sync ──────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
    if (event.tag === 'flush-mutations') {
        event.waitUntil(flushQueue());
    }
});

// ─── Fetch: routing strategy ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET for caching (but queue mutations when offline)
    if (request.method !== 'GET') {
        event.respondWith(
            fetch(request.clone()).catch(async () => {
                await enqueueRequest(request);
                return new Response(
                    JSON.stringify({ queued: true, message: 'Saved offline. Will sync when reconnected.' }),
                    { status: 202, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // Navigation: network-first → offline page fallback
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    // Firestore/API: network-first, cache on success
    if (
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('firebase') ||
        url.pathname.startsWith('/api/')
    ) {
        event.respondWith(
            fetch(request.clone())
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Static assets (fonts, images): cache-first, stale-while-revalidate
    if (
        url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/)
    ) {
        event.respondWith(
            caches.match(request).then(cached => {
                const fetchAndCache = fetch(request).then(response => {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then(c => c.put(request, response.clone()));
                    }
                    return response;
                });
                return cached || fetchAndCache;
            })
        );
        return;
    }

    // JS/CSS app shell: cache-first
    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request))
    );
});

// ─── Push notifications (stub — ready to wire up) ────────────────────────────
self.addEventListener('push', event => {
    const data = event.data?.json() ?? {};
    event.waitUntil(
        self.registration.showNotification(data.title ?? 'IntelliStock', {
            body:    data.body ?? '',
            icon:    '/icons/icon-192.png',
            badge:   '/icons/badge-72.png',
            tag:     data.tag ?? 'intellistock',
            data:    { url: data.url ?? '/dashboard' },
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windows => {
            const target = event.notification.data?.url ?? '/dashboard';
            for (const win of windows) {
                if (win.url === target && 'focus' in win) return win.focus();
            }
            return clients.openWindow(target);
        })
    );
});
