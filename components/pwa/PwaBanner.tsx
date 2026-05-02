'use client';

/**
 * PwaBanner
 *
 * Renders three non-intrusive banners depending on PWA state:
 *   1. Offline bar     — red strip at top when navigator.onLine is false
 *   2. Sync pending    — amber strip showing queued mutations count
 *   3. Update ready    — indigo strip with "Apply update" CTA
 *   4. Install prompt  — bottom bar with "Add to Home Screen" CTA
 *
 * Wire it once inside dashboard/layout.tsx, after the <header>.
 */

import { usePwa } from '@/lib/hooks/usePwa';
import { WifiOff, RefreshCw, Download, UploadCloud, X } from 'lucide-react';
import { useState } from 'react';

export function PwaBanner() {
    const { isOnline, canInstall, install, updateAvailable, applyUpdate, pendingCount } = usePwa();
    const [installDismissed, setInstallDismissed] = useState(false);

    return (
        <>
            {/* Offline bar */}
            {!isOnline && (
                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-xs font-semibold z-[60] w-full">
                    <WifiOff className="w-3.5 h-3.5 shrink-0" />
                    You're offline — viewing cached data. Changes will sync when reconnected.
                    {pendingCount > 0 && (
                        <span className="bg-white/20 rounded-full px-2 py-0.5 ml-1">
                            {pendingCount} pending
                        </span>
                    )}
                </div>
            )}

            {/* Back online with pending mutations */}
            {isOnline && pendingCount > 0 && (
                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-white text-xs font-semibold z-[60] w-full">
                    <UploadCloud className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                    Syncing {pendingCount} queued change{pendingCount > 1 ? 's' : ''} to Firestore…
                </div>
            )}

            {/* Update available */}
            {updateAvailable && (
                <div className="flex items-center justify-center gap-3 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold z-[60] w-full">
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    A new version of IntelliStock is available.
                    <button
                        onClick={applyUpdate}
                        className="underline underline-offset-2 hover:no-underline ml-1"
                    >
                        Reload to update
                    </button>
                </div>
            )}

            {/* Install prompt — bottom bar on mobile */}
            {canInstall && !installDismissed && (
                <div className="fixed bottom-0 left-0 right-0 z-[60] flex items-center gap-3 px-5 py-4 bg-background border-t shadow-2xl lg:hidden">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 font-bold text-white text-sm">IS</div>
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">Add to Home Screen</p>
                        <p className="text-xs text-muted-foreground">Use IntelliStock like a native app — offline ready.</p>
                    </div>
                    <button
                        onClick={install}
                        className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-semibold px-3 py-2 rounded-lg shrink-0"
                    >
                        <Download className="w-3.5 h-3.5" /> Install
                    </button>
                    <button
                        onClick={() => setInstallDismissed(true)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </>
    );
}
