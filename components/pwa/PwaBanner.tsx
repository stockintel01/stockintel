'use client';

import { useState } from 'react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { usePwa } from '@/lib/hooks/usePwa';

export function PwaBanner() {
    const { isOnline, canInstall, install, updateAvailable, applyUpdate } = usePwa();
    const [installDismissed, setInstallDismissed] = useState(false);

    return (
        <>
            {!isOnline && (
                <div className="sticky top-0 z-[70] flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-center text-xs font-semibold text-white">
                    <WifiOff className="h-3.5 w-3.5 shrink-0" />
                    Offline mode: cached data is available and supported changes sync automatically.
                </div>
            )}
            {updateAvailable && (
                <div className="sticky top-0 z-[70] flex items-center justify-center gap-3 bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">
                    <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                    A new version is available.
                    <button onClick={applyUpdate} className="underline underline-offset-2">Reload to update</button>
                </div>
            )}
            {canInstall && !installDismissed && (
                <div className="fixed bottom-16 left-3 right-3 z-[70] flex items-center gap-3 rounded-xl border bg-background px-4 py-3 shadow-2xl lg:hidden">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">IS</div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">Install StockIntel</p>
                        <p className="text-xs text-muted-foreground">Faster access with offline support.</p>
                    </div>
                    <button onClick={install} className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"><Download className="h-3.5 w-3.5" />Install</button>
                    <button onClick={() => setInstallDismissed(true)} className="p-1 text-muted-foreground"><X className="h-4 w-4" /></button>
                </div>
            )}
        </>
    );
}
