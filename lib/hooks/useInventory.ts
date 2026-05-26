/**
 * useInventory.ts
 *
 * React hook that wires Firestore real-time inventory into the Zustand store.
 *
 * Drop this once in dashboard/layout.tsx:
 *   const { loading } = useInventory();
 *
 * After mount the Zustand `inventory` slice stays in sync with Firestore
 * automatically — all existing components work with zero changes.
 */

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { subscribeToInventory, seedInventory } from '@/lib/inventory-service';
import { InventoryItem } from '@/lib/mock-data';

interface UseInventoryReturn {
    loading: boolean;
    error: Error | null;
    refresh: () => void;
}

export function useInventory(): UseInventoryReturn {
    const { organization, user, addInventoryItem } = useAppStore();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [tick, setTick] = useState(0);
    const cleanupRef = useRef<(() => void) | null>(null);

    const orgId = organization?.id ?? null;
    const userId = user?.id ?? null;

    useEffect(() => {
        // Clean up previous listener before setting up a new one
        cleanupRef.current?.();
        cleanupRef.current = null;

        if (!orgId || !userId) {
            // Not authenticated — use existing Zustand/persisted state
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        let cancelled = false;

        async function init() {
            try {
                // Seed starter data for brand-new orgs (no-op if already has data)
                await seedInventory(orgId!, userId!);

                if (cancelled) return;

                // Subscribe to real-time updates and push into Zustand
                cleanupRef.current = subscribeToInventory(
                    orgId!,
                    (items: InventoryItem[]) => {
                        // Replace store inventory by adding items not already present
                        items.forEach(item => addInventoryItem(item));
                        setLoading(false);
                    },
                    (err: Error) => {
                        console.error('[useInventory]', err);
                        setError(err);
                        setLoading(false);
                    },
                );
            } catch (err) {
                if (!cancelled) {
                    console.warn('[useInventory] Firestore unavailable, falling back to local state:', err);
                    setLoading(false);
                }
            }
        }

        init();

        return () => {
            cancelled = true;
            cleanupRef.current?.();
            cleanupRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId, userId, tick]);

    return {
        loading,
        error,
        refresh: () => setTick(t => t + 1),
    };
}
