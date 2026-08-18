'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, doc, increment, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppStore } from '@/lib/store';
import { canConvertItemQuantity, convertItemQuantity } from './units';
import type {
  AnimalFlockHerd, EggProductionRecord, EggSaleRecord, FeedConsumptionLog,
  LivestockFeedPlan, LivestockSaleRecord, MilkProductionRecord, MortalityRecord,
  PenHouse, VaccinationRecord, WeightRecord,
} from './livestock-types';

export type LivestockRecordKind =
  | 'flock' | 'pen' | 'eggProduction' | 'eggSale' | 'feedLog' | 'feedPlan'
  | 'mortality' | 'vaccination' | 'weight' | 'milk' | 'livestockSale';

interface LivestockState {
  flocks: AnimalFlockHerd[];
  pens: PenHouse[];
  eggRecords: EggProductionRecord[];
  eggSales: EggSaleRecord[];
  feedLogs: FeedConsumptionLog[];
  feedPlans: LivestockFeedPlan[];
  mortality: MortalityRecord[];
  vaccinations: VaccinationRecord[];
  weights: WeightRecord[];
  milkRecords: MilkProductionRecord[];
  livestockSales: LivestockSaleRecord[];
  loading: boolean;
  error: string | null;
}

const EMPTY: LivestockState = {
  flocks: [], pens: [], eggRecords: [], eggSales: [], feedLogs: [], feedPlans: [],
  mortality: [], vaccinations: [], weights: [], milkRecords: [], livestockSales: [],
  loading: true, error: null,
};

const KIND_TO_KEY: Record<LivestockRecordKind, keyof LivestockState> = {
  flock: 'flocks',
  pen: 'pens',
  eggProduction: 'eggRecords',
  eggSale: 'eggSales',
  feedLog: 'feedLogs',
  feedPlan: 'feedPlans',
  mortality: 'mortality',
  vaccination: 'vaccinations',
  weight: 'weights',
  milk: 'milkRecords',
  livestockSale: 'livestockSales',
};

export function useLivestock() {
  const { organization, user } = useAppStore();
  const [state, setState] = useState<LivestockState>(EMPTY);

  useEffect(() => {
    if (!organization?.id) {
      setState({ ...EMPTY, loading: false });
      return;
    }
    return onSnapshot(
      collection(db, `organizations/${organization.id}/agric_livestock`),
      snapshot => {
        const next: LivestockState = { ...EMPTY, loading: false };
        for (const document of snapshot.docs) {
          const data = document.data() as { kind?: LivestockRecordKind; createdAt?: unknown };
          if (!data.kind || !KIND_TO_KEY[data.kind]) continue;
          const key = KIND_TO_KEY[data.kind];
          const record = { ...data, id: document.id };
          (next[key] as unknown[]).push(record);
        }
        const datedKeys: Array<keyof LivestockState> = [
          'eggRecords', 'eggSales', 'feedLogs', 'mortality', 'vaccinations',
          'weights', 'milkRecords', 'livestockSales',
        ];
        for (const key of datedKeys) {
          (next[key] as Array<{ date?: string }>).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
        }
        setState(next);
      },
      error => setState(current => ({ ...current, loading: false, error: error.message })),
    );
  }, [organization?.id]);

  const addRecord = useCallback(async <T extends { id: string }>(
    kind: LivestockRecordKind,
    record: T,
  ) => {
    if (!organization?.id || !user?.id) throw new Error('An authenticated organization is required.');
    if (kind === 'feedLog' && typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Feed logging requires a connection so available stock can be verified safely.');
    }
    const { id: _id, ...data } = record;

    if (kind === 'feedLog') {
      const feedLog = data as unknown as Omit<FeedConsumptionLog, 'id'>;
      await runTransaction(db, async tx => {
        const inventoryRef = doc(db, `organizations/${organization.id}/agric_inventory/${feedLog.feedItemId}`);
        const inventorySnap = await tx.get(inventoryRef);
        if (!inventorySnap.exists()) throw new Error('The selected feed item is no longer in inventory.');

        const inventory = inventorySnap.data();
        const stockUom = inventory.uom as import('./types').UOM;
        if (!canConvertItemQuantity('kg', stockUom, inventory.packSize)) {
          throw new Error(`Cannot convert kilograms to this feed item's stock unit (${stockUom}). Add a pack size or use a weight unit.`);
        }
        const stockQuantity = convertItemQuantity(feedLog.quantityKg, 'kg', stockUom, inventory.packSize);
        const currentStock = Number(inventory.currentStock ?? 0);
        if (currentStock < stockQuantity) {
          throw new Error(`Insufficient feed stock: ${currentStock} ${stockUom} available.`);
        }

        tx.update(inventoryRef, {
          currentStock: increment(-stockQuantity),
          lastUpdated: new Date().toISOString().slice(0, 10),
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(collection(db, `organizations/${organization.id}/agric_livestock`)), {
          ...data,
          kind,
          createdById: user.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      return;
    }

    await addDoc(collection(db, `organizations/${organization.id}/agric_livestock`), {
      ...data,
      kind,
      createdById: user.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, [organization?.id, user?.id]);

  return { ...state, addRecord };
}
