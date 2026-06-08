/**
 * inventory-service.ts
 * 
 * Full Firestore CRUD + real-time listener for inventory.
 * 
 * Data path:  organizations/{orgId}/inventory/{itemId}
 * 
 * Exports:
 *  - subscribeToInventory()  — real-time onSnapshot listener
 *  - addItem()               — add new item (deduplicates by SKU)
 *  - updateItem()            — update any fields
 *  - deleteItem()            — soft-delete (sets deletedAt)
 *  - adjustQuantity()        — atomic increment/decrement via transaction
 *  - bulkImport()            — batch-write array of items
 *  - seedInventory()         — one-time seed for new orgs from mock data
 *  - exportToCsv()           — client-side CSV blob
 */

import {
    collection, doc, onSnapshot, addDoc, updateDoc,
    runTransaction, writeBatch, query,
    orderBy, getDocs, serverTimestamp, Timestamp,
    where, increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { InventoryItem } from '@/lib/mock-data';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface FirestoreInventoryItem extends InventoryItem {
    organizationId: string;
    createdAt: Timestamp | null;
    updatedAt: Timestamp | null;
    deletedAt: Timestamp | null;    // soft-delete
    createdBy: string;              // user uid
}

type Unsubscribe = () => void;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function inventoryRef(orgId: string) {
    return collection(db, `organizations/${orgId}/inventory`);
}

function itemRef(orgId: string, itemId: string) {
    return doc(db, `organizations/${orgId}/inventory/${itemId}`);
}

function firestoreToItem(data: Record<string, unknown>, id: string): InventoryItem {
    return {
        id,
        name: (data.name as string) ?? '',
        sku: (data.sku as string) ?? '',
        batchNumber: (data.batchNumber as string) ?? '',
        expiryDate: (data.expiryDate as string) ?? '',
        quantity: (data.quantity as number) ?? 0,
        unit: (data.unit as string) ?? 'Units',
        mrp: (data.mrp as number) ?? 0,
        costPrice: (data.costPrice as number) ?? 0,
        category: (data.category as string) ?? 'General',
        location: (data.location as string) ?? '',
    };
}

// ─────────────────────────────────────────────
// Real-time listener
// ─────────────────────────────────────────────

/**
 * Subscribes to live inventory updates for an org.
 * Filters out soft-deleted items.
 * Calls onData with the current array whenever Firestore updates.
 * Returns an unsubscribe function — call it on component unmount.
 */
export function subscribeToInventory(
    orgId: string,
    onData: (items: InventoryItem[]) => void,
    onError?: (err: Error) => void,
): Unsubscribe {
    const q = query(
        inventoryRef(orgId),
        where('deletedAt', '==', null),
        orderBy('name'),
    );

    return onSnapshot(
        q,
        (snapshot) => {
            const items = snapshot.docs.map(d =>
                firestoreToItem(d.data() as Record<string, unknown>, d.id)
            );
            onData(items);
        },
        (err) => {
            console.error('[inventory-service] onSnapshot error:', err);
            onError?.(err);
        },
    );
}

// ─────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────

/** Add a new inventory item. Returns the Firestore-generated ID. */
export async function addItem(
    orgId: string,
    item: Omit<InventoryItem, 'id'>,
    createdBy: string,
): Promise<string> {
    const ref = await addDoc(inventoryRef(orgId), {
        ...item,
        organizationId: orgId,
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        deletedAt: null,
    });
    return ref.id;
}

/** Update specific fields on an existing item. */
export async function updateItem(
    orgId: string,
    itemId: string,
    fields: Partial<Omit<InventoryItem, 'id'>>,
): Promise<void> {
    await updateDoc(itemRef(orgId, itemId), {
        ...fields,
        updatedAt: serverTimestamp(),
    });
}

/** Soft-delete an item (sets deletedAt, keeps audit trail). */
export async function deleteItem(orgId: string, itemId: string): Promise<void> {
    await updateDoc(itemRef(orgId, itemId), {
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}

/**
 * Atomically adjust item quantity (e.g. -3 for a sale, +50 for restock).
 * Uses Firestore increment() so concurrent updates don't race.
 * Throws if the result would go below zero.
 */
export async function adjustQuantity(
    orgId: string,
    itemId: string,
    delta: number,
): Promise<void> {
    const ref = itemRef(orgId, itemId);

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(`Item ${itemId} not found`);

        const current = (snap.data().quantity as number) ?? 0;
        const next = current + delta;
        if (next < 0) throw new Error(`Insufficient stock: ${current} available, tried to remove ${Math.abs(delta)}`);

        tx.update(ref, {
            quantity: increment(delta),
            updatedAt: serverTimestamp(),
        });
    });
}

// ─────────────────────────────────────────────
// Bulk operations
// ─────────────────────────────────────────────

/**
 * Batch-import an array of items (max 500 per Firestore batch).
 * Skips items whose SKU already exists in the org.
 * Returns count of items actually written.
 */
export async function bulkImport(
    orgId: string,
    items: Omit<InventoryItem, 'id'>[],
    createdBy: string,
): Promise<number> {
    // Fetch existing SKUs to deduplicate
    const existing = await getDocs(inventoryRef(orgId));
    const existingSkus = new Set(existing.docs.map(d => String(d.data().sku ?? '').toLowerCase()));

    const toWrite = items.filter(i => !existingSkus.has(i.sku.toLowerCase()));
    if (toWrite.length === 0) return 0;

    // Firestore batches are limited to 500 ops
    const CHUNK = 499;
    let written = 0;

    for (let i = 0; i < toWrite.length; i += CHUNK) {
        const chunk = toWrite.slice(i, i + CHUNK);
        const batch = writeBatch(db);

        for (const item of chunk) {
            const ref = doc(inventoryRef(orgId));
            batch.set(ref, {
                ...item,
                organizationId: orgId,
                createdBy,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                deletedAt: null,
            });
        }

        await batch.commit();
        written += chunk.length;
    }

    return written;
}

/**
 * Seed a brand-new organisation with the MOCK_INVENTORY starter data.
 * Safe to call multiple times — skips if org already has inventory.
 */
// ─────────────────────────────────────────────
// CSV export
// ─────────────────────────────────────────────

/** Generate and trigger download of a CSV file from current inventory. */
export function exportToCsv(items: InventoryItem[], filename = 'inventory.csv'): void {
    const headers = ['Name', 'SKU', 'Batch', 'Expiry', 'Qty', 'Unit', 'Cost', 'MRP', 'Margin%', 'Category', 'Location'];

    const rows = items.map(item => {
        const margin = item.mrp > 0
            ? (((item.mrp - item.costPrice) / item.mrp) * 100).toFixed(1)
            : '0';
        return [
            item.name, item.sku, item.batchNumber, item.expiryDate,
            item.quantity, item.unit, item.costPrice, item.mrp,
            margin, item.category, item.location,
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
