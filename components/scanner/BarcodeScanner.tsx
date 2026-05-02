'use client';

/**
 * BarcodeScanner
 *
 * A self-contained camera barcode scanner component.
 * 
 * Strategy:
 *   1. Try native BarcodeDetector API (Chrome Android, Safari 17+) — zero bundle cost
 *   2. Falls back to a WASM-free pure-JS decoder loaded from CDN via <script> injection
 *      so the main bundle stays small.
 *
 * Props:
 *   onDetected(code)  — called once per unique code (debounced 1.5s)
 *   onClose()         — called when the user dismisses the scanner
 *   hint?             — text shown under the viewfinder, e.g. "Scan a drug barcode"
 *   formats?          — BarcodeDetector format array, defaults to common retail formats
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Flashlight, SwitchCamera, AlertTriangle, Scan } from 'lucide-react';

type BarcodeFormat =
    | 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e'
    | 'code_128' | 'code_39' | 'qr_code' | 'data_matrix' | 'itf';

interface BarcodeScannerProps {
    onDetected: (code: string) => void;
    onClose: () => void;
    hint?: string;
    formats?: BarcodeFormat[];
}

const DEFAULT_FORMATS: BarcodeFormat[] = [
    'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code',
];

declare global {
    interface Window {
        BarcodeDetector?: {
            new(opts: { formats: string[] }): {
                detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<{ rawValue: string; format: string }[]>;
            };
            getSupportedFormats(): Promise<string[]>;
        };
        ZXing?: {
            BrowserMultiFormatReader: new () => {
                decodeOnceFromVideoElement(video: HTMLVideoElement): Promise<{ getText(): string }>;
                reset(): void;
            };
        };
    }
}

export function BarcodeScanner({
    onDetected,
    onClose,
    hint = 'Scan a barcode or QR code',
    formats = DEFAULT_FORMATS,
}: BarcodeScannerProps) {
    const videoRef      = useRef<HTMLVideoElement>(null);
    const streamRef     = useRef<MediaStream | null>(null);
    const detectorRef   = useRef<ReturnType<NonNullable<Window['BarcodeDetector']>['prototype']['constructor']> | null>(null);
    const loopRef       = useRef<number>(0);
    const lastCodeRef   = useRef<string>('');
    const lastTimeRef   = useRef<number>(0);

    const [error, setError]         = useState('');
    const [torch, setTorch]         = useState(false);
    const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
    const [ready, setReady]         = useState(false);
    const [detected, setDetected]   = useState('');
    const [useZxing, setUseZxing]   = useState(false);

    // ── Load ZXing from CDN as fallback ───────────────────────────────────────
    const loadZxing = useCallback(() => {
        return new Promise<void>((resolve, reject) => {
            if (window.ZXing) { resolve(); return; }
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js';
            s.onload  = () => resolve();
            s.onerror = () => reject(new Error('Failed to load ZXing fallback'));
            document.head.appendChild(s);
        });
    }, []);

    // ── Camera init ───────────────────────────────────────────────────────────
    const startCamera = useCallback(async (facing: 'environment' | 'user') => {
        // Stop any existing stream
        streamRef.current?.getTracks().forEach(t => t.stop());
        cancelAnimationFrame(loopRef.current);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: facing },
                    width:  { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            });
            streamRef.current = stream;

            const video = videoRef.current!;
            video.srcObject = stream;
            await video.play();
            setReady(true);
            setError('');

            // Choose detection strategy
            if (window.BarcodeDetector) {
                const supported = await window.BarcodeDetector.getSupportedFormats();
                const filtered  = formats.filter(f => supported.includes(f));
                detectorRef.current = new window.BarcodeDetector({ formats: filtered.length ? filtered : supported });
                startNativeLoop();
            } else {
                // Load ZXing fallback
                setUseZxing(true);
                await loadZxing();
                startZxing(video);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('Permission') || msg.includes('NotAllowed')) {
                setError('Camera permission denied. Please allow camera access in your browser settings.');
            } else {
                setError(`Camera error: ${msg}`);
            }
        }
    }, [formats, loadZxing]);

    // ── Native BarcodeDetector loop ───────────────────────────────────────────
    const startNativeLoop = useCallback(() => {
        const tick = async () => {
            const video = videoRef.current;
            if (!video || !detectorRef.current || video.readyState < 2) {
                loopRef.current = requestAnimationFrame(tick);
                return;
            }
            try {
                const results = await detectorRef.current.detect(video);
                if (results.length > 0) handleCode(results[0].rawValue);
            } catch { /* frame decode error — continue */ }
            loopRef.current = requestAnimationFrame(tick);
        };
        loopRef.current = requestAnimationFrame(tick);
    }, []);

    // ── ZXing fallback ────────────────────────────────────────────────────────
    const startZxing = useCallback((video: HTMLVideoElement) => {
        if (!window.ZXing) return;
        const reader = new window.ZXing.BrowserMultiFormatReader();
        reader.decodeOnceFromVideoElement(video)
            .then(result => {
                handleCode(result.getText());
                // Re-arm for continuous scanning
                setTimeout(() => startZxing(video), 1500);
            })
            .catch(() => setTimeout(() => startZxing(video), 500));
    }, []);

    // ── Code handler with debounce ────────────────────────────────────────────
    const handleCode = useCallback((code: string) => {
        const now = Date.now();
        if (code === lastCodeRef.current && now - lastTimeRef.current < 1500) return;
        lastCodeRef.current = code;
        lastTimeRef.current = now;

        // Flash feedback
        setDetected(code);
        setTimeout(() => setDetected(''), 1200);

        // Haptic feedback
        if ('vibrate' in navigator) navigator.vibrate(60);

        onDetected(code);
    }, [onDetected]);

    // ── Torch toggle ──────────────────────────────────────────────────────────
    const toggleTorch = async () => {
        const track = streamRef.current?.getVideoTracks()[0];
        if (!track) return;
        try {
            await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
            setTorch(t => !t);
        } catch { /* torch not supported */ }
    };

    // ── Camera flip ───────────────────────────────────────────────────────────
    const flipCamera = () => {
        const next = facingMode === 'environment' ? 'user' : 'environment';
        setFacingMode(next);
        startCamera(next);
    };

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    useEffect(() => {
        startCamera('environment');
        return () => {
            cancelAnimationFrame(loopRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, []);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.96)',
            display: 'flex', flexDirection: 'column',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Scan size={20} color="#6366f1" />
                    <span style={{ color: 'white', fontWeight: 600, fontSize: 16 }}>Barcode Scanner</span>
                </div>
                <button onClick={onClose}
                    style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 9, padding: 8, cursor: 'pointer' }}>
                    <X size={20} color="white" />
                </button>
            </div>

            {/* Viewfinder */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                    }}
                />

                {/* Scan frame overlay */}
                {ready && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <div style={{ position: 'relative', width: 280, height: 180 }}>
                            {/* Corner brackets */}
                            {[
                                { top: 0, left: 0, borderTop: '3px solid', borderLeft: '3px solid', borderRadius: '12px 0 0 0' },
                                { top: 0, right: 0, borderTop: '3px solid', borderRight: '3px solid', borderRadius: '0 12px 0 0' },
                                { bottom: 0, left: 0, borderBottom: '3px solid', borderLeft: '3px solid', borderRadius: '0 0 0 12px' },
                                { bottom: 0, right: 0, borderBottom: '3px solid', borderRight: '3px solid', borderRadius: '0 0 12px 0' },
                            ].map((style, i) => (
                                <div key={i} style={{
                                    position: 'absolute', width: 32, height: 32,
                                    borderColor: detected ? '#22c55e' : '#6366f1',
                                    transition: 'border-color 0.2s',
                                    ...style,
                                }} />
                            ))}

                            {/* Scan line */}
                            <div style={{
                                position: 'absolute', left: 8, right: 8,
                                height: 2,
                                background: detected
                                    ? 'linear-gradient(90deg, transparent, #22c55e, transparent)'
                                    : 'linear-gradient(90deg, transparent, #6366f1, transparent)',
                                boxShadow: detected ? '0 0 12px #22c55e' : '0 0 12px #6366f1',
                                animation: detected ? 'none' : 'scan 2s ease-in-out infinite',
                                top: detected ? '50%' : undefined,
                            }} />
                        </div>

                        <style>{`
                            @keyframes scan {
                                0%   { top: 8px; }
                                50%  { top: calc(100% - 10px); }
                                100% { top: 8px; }
                            }
                        `}</style>
                    </div>
                )}

                {/* Loading overlay */}
                {!ready && !error && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, border: '3px solid rgba(99,102,241,0.3)', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Starting camera…</p>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, textAlign: 'center' }}>
                        <AlertTriangle size={40} color="#ef4444" />
                        <p style={{ color: 'white', fontSize: 15, fontWeight: 500 }}>{error}</p>
                        <button onClick={() => startCamera(facingMode)}
                            style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                            Retry
                        </button>
                    </div>
                )}

                {/* Detected flash */}
                {detected && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(34,197,94,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'fadeFlash 1.2s ease forwards',
                        pointerEvents: 'none',
                    }}>
                        <div style={{ background: 'rgba(0,0,0,0.8)', borderRadius: 14, padding: '14px 24px', textAlign: 'center' }}>
                            <p style={{ color: '#22c55e', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>✓ Detected</p>
                            <p style={{ color: 'white', fontFamily: 'monospace', fontSize: 18, fontWeight: 600, letterSpacing: '0.05em' }}>{detected}</p>
                        </div>
                        <style>{`@keyframes fadeFlash { 0%{opacity:1} 80%{opacity:1} 100%{opacity:0} }`}</style>
                    </div>
                )}

                {/* Controls: torch + flip */}
                {ready && (
                    <div style={{ position: 'absolute', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <button onClick={toggleTorch}
                            style={{ width: 46, height: 46, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: torch ? '#fbbf24' : 'rgba(255,255,255,0.15)' }}>
                            <Flashlight size={20} color={torch ? '#000' : 'white'} />
                        </button>
                        <button onClick={flipCamera}
                            style={{ width: 46, height: 46, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <SwitchCamera size={20} color="white" />
                        </button>
                    </div>
                )}
            </div>

            {/* Hint bar */}
            <div style={{ padding: '16px 20px', textAlign: 'center', flexShrink: 0 }}>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{hint}</p>
                {useZxing && (
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 4 }}>Using software decoder</p>
                )}
            </div>
        </div>
    );
}
