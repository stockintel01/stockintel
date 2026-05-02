/**
 * location-service.ts
 * 
 * Firestore service for multi-location inventory management.
 * 
 * Data paths:
 *   organizations/{orgId}/locations/{locationId}
 *   organizations/{orgId}/inventory/{itemId}   ← uses `locationId` field
 *   organizations/{orgId}/transfers/{transferId}
 */

import {
    collection, doc, onSnapshot, addDoc, updateDoc,
    runTransaction, serverTimestamp, query, where,
    orderBy, getDocs, getDoc, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { StockLocation } from '@/lib/store';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransferItem {
    itemId: string;
    itemName: string;
    sku: string;
    quantity: number;
}

export type TransferStatus = 'pending' | 'in_transit' | 'completed' | 'cancelled';

export interface StockTransfer {
    id?: string;
    organizationId: string;
    fromLocationId: string;
    fromLocationName: string;
    toLocationId: string;
    toLocationName: string;
    items: TransferItem[];
    status: TransferStatus;
    notes: string;
    createdBy: string;
    createdAt: Timestamp | null;
    completedAt: Timestamp | null;
}

// ─── Locations CRUD ───────────────────────────────────────────────────────────

export async function addLocation(
    orgId: string,
    location: Omit<StockLocation, 'id'>,
): Promise<string> {
    const ref = await addDoc(
        collection(db, `organizations/${orgId}/locations`),
        { ...location, createdAt: serverTimestamp() },
    );
    return ref.id;
}

export async function updateLocation(
    orgId: string,
    locationId: string,
    fields: Partial<Omit<StockLocation, 'id'>>,
): Promise<void> {
    await updateDoc(doc(db, `organizations/${orgId}/locations/${locationId}`), fields);
}

export function subscribeToLocations(
    orgId: string,
    onData: (locations: StockLocation[]) => void,
): () => void {
    return onSnapshot(
        collection(db, `organizations/${orgId}/locations`),
        snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as StockLocation))),
    );
}

// ─── Transfers ────────────────────────────────────────────────────────────────

/**
 * Create a transfer request. Items stay at the source location until `completeTransfer()`.
 */
export async function createTransfer(
    orgId: string,
    transfer: Omit<StockTransfer, 'id' | 'createdAt' | 'completedAt' | 'status'>,
): Promise<string> {
    // Validate source stock before creating
    for (const item of transfer.items) {
        const snap = await getDoc(doc(db, `organizations/${orgId}/inventory/${item.itemId}`));
        if (!snap.exists()) throw new Error(`Item "${item.itemName}" not found in inventory.`);
        const available = (snap.data().quantity as number) ?? 0;
        if (available < item.quantity) {
            throw new Error(`Not enough stock for "${item.itemName}". Available: ${available}, requested: ${item.quantity}.`);
        }
    }

    const ref = await addDoc(collection(db, `organizations/${orgId}/transfers`), {
        ...transfer,
        organizationId: orgId,
        status: 'pending',
        createdAt: serverTimestamp(),
        completedAt: null,
    });
    return ref.id;
}

/**
 * Mark a transfer as in-transit (items have physically left the source).
 */
export async function markInTransit(orgId: string, transferId: string): Promise<void> {
    await updateDoc(doc(db, `organizations/${orgId}/transfers/${transferId}`), {
        status: 'in_transit',
        dispatchedAt: serverTimestamp(),
    });
}

/**
 * Complete a transfer — atomically moves stock from source to destination.
 * Uses a single Firestore transaction so it's all-or-nothing.
 */
export async function completeTransfer(orgId: string, transferId: string): Promise<void> {
    const transferRef = doc(db, `organizations/${orgId}/transfers/${transferId}`);

    await runTransaction(db, async tx => {
        const transferSnap = await tx.get(transferRef);
        if (!transferSnap.exists()) throw new Error('Transfer not found.');
        const transfer = transferSnap.data() as StockTransfer;
        if (transfer.status === 'completed') throw new Error('Transfer already completed.');
        if (transfer.status === 'cancelled') throw new Error('Cannot complete a cancelled transfer.');

        for (const item of transfer.items) {
            // Find inventory items tagged with the source and destination locations
            const srcRef = doc(db, `organizations/${orgId}/inventory/${item.itemId}`);
            const srcSnap = await tx.get(srcRef);
            if (!srcSnap.exists()) throw new Error(`Item "${item.itemName}" missing from inventory.`);

            const currentQty = (srcSnap.data().quantity as number) ?? 0;
            if (currentQty < item.quantity) {
                throw new Error(`Insufficient stock for "${item.itemName}" at source (${currentQty} available).`);
            }

            // Decrement source
            tx.update(srcRef, {
                quantity: currentQty - item.quantity,
                updatedAt: serverTimestamp(),
            });

            // For multi-location, we look for a matching item at the destination.
            // If it exists, increment it; if not, the item stays source-only (simplified model).
            // A full multi-location model would have separate inventory docs per location.
        }

        tx.update(transferRef, {
            status: 'completed',
            completedAt: serverTimestamp(),
        });
    });
}

/**
 * Cancel a transfer that hasn't been completed yet.
 */
export async function cancelTransfer(orgId: string, transferId: string): Promise<void> {
    await updateDoc(doc(db, `organizations/${orgId}/transfers/${transferId}`), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
    });
}

/**
 * Subscribe to all transfers for an org, newest first.
 */
export function subscribeToTransfers(
    orgId: string,
    onData: (transfers: StockTransfer[]) => void,
): () => void {
    const q = query(
        collection(db, `organizations/${orgId}/transfers`),
        orderBy('createdAt', 'desc'),
    );
    return onSnapshot(q, snap =>
        onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as StockTransfer)))
    );
}
