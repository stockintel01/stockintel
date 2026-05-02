import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // ── Compiler ──────────────────────────────────────────────────────────────
    // Strip console.log in production (keep console.error/warn for monitoring)
    compiler: {
        removeConsole: process.env.NODE_ENV === 'production'
            ? { exclude: ['error', 'warn'] }
            : false,
    },

    // ── Experimental ──────────────────────────────────────────────────────────
    // Enable when needed — leaving off for stability
    // experimental: { turbo: {} },

    // ── Images ────────────────────────────────────────────────────────────────
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
            { protocol: 'https', hostname: 'lh3.googleusercontent.com' }, // Google profile photos
        ],
        formats: ['image/avif', 'image/webp'],
    },

    // ── Headers ───────────────────────────────────────────────────────────────
    async headers() {
        return [
            {
                source: '/sw.js',
                headers: [
                    { key: 'Cache-Control',          value: 'no-cache, no-store, must-revalidate' },
                    { key: 'Service-Worker-Allowed', value: '/' },
                ],
            },
            {
                source: '/manifest.json',
                headers: [
                    { key: 'Content-Type',  value: 'application/manifest+json' },
                    { key: 'Cache-Control', value: 'public, max-age=604800' },
                ],
            },
        ];
    },

    // ── Redirects ─────────────────────────────────────────────────────────────
    async redirects() {
        return [
            // Redirect /home → / for any legacy links
            {
                source:      '/home',
                destination: '/',
                permanent:   true,
            },
        ];
    },
};

export default nextConfig;
