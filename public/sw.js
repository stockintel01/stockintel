const CACHE_NAME = 'intellistock-v3';
const OFFLINE_URL = '/offline';
const STATIC_ASSETS = [OFFLINE_URL, '/manifest.json', '/logo.svg'];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Authenticated APIs and Firebase must always use the network. Caching or
    // replaying these requests can expose stale data or duplicate mutations.
    if (request.method !== 'GET' || url.pathname.startsWith('/api/') || url.hostname.includes('firebase') || url.hostname.includes('googleapis.com')) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).then(response => {
            if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
            return response;
        }).catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_URL))));
        return;
    }

    if (url.origin === self.location.origin && /\.(png|jpg|jpeg|svg|webp|ico|woff2?|css|js)$/.test(url.pathname)) {
        event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
            if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
            return response;
        })));
    }
});
