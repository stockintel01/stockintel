'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeToInventory } from '@/lib/inventory-service';
import { useAppStore } from '@/lib/store';

interface UseInventoryReturn {
    loading: boolean;
    error: Error | null;
    refresh: () => void;
}

export function useInventory(): UseInventoryReturn {
    const organization = useAppStore(state => state.organization);
    const user = useAppStore(state => state.user);
    const setInventory = useAppStore(state => state.setInventory);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [tick, setTick] = useState(0);
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        cleanupRef.current?.();
        cleanupRef.current = null;

        if (!organization?.id || !user?.id) {
            setInventory([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        cleanupRef.current = subscribeToInventory(
            organization.id,
            items => {
                setInventory(items);
                setLoading(false);
            },
            err => {
                console.error('[useInventory]', err);
                setInventory([]);
                setError(err);
                setLoading(false);
            },
        );

        return () => {
            cleanupRef.current?.();
            cleanupRef.current = null;
        };
    }, [organization?.id, user?.id, setInventory, tick]);

    return {
        loading,
        error,
        refresh: () => setTick(value => value + 1),
    };
}
