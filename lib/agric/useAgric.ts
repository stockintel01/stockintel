/**
 * useAgric.ts
 *
 * Central React hook for the Agriculture module.
 * - Connects to Firestore when authenticated (production)
 * - Falls back to mock data when unauthenticated (demo/dev)
 * - Exposes typed state + actions to all agric pages
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  MOCK_AGRIC_INVENTORY, MOCK_AGRIC_ALERTS, MOCK_STOCK_REQUESTS,
  MOCK_EQUIPMENT_CHECKOUTS, MOCK_PACKING_RECORDS, MOCK_SHIPPING_RECORDS,
  MOCK_SPRAY_PLANS,
} from './mock-data';
import type {
  AgricInventoryItem, UsageLog, StockRequest, EquipmentCheckout,
  SprayPlan, PackingRecord, ShippingRecord, AgricAlert, StockAdjustment,
} from './types';
import {
  subscribeInventory, subscribeUsageLogs, subscribeRequests,
  subscribeEquipment, subscribePlans, subscribePackingToday,
  subscribeShipping, subscribeAlerts,
  addInventoryItem as fsAddItem, updateInventoryItem, softDeleteInventoryItem,
  submitStockAdjustment, approveStockAdjustment, seedAgricInventory,
  addUsageLog, createStockRequest, updateRequestStatus, dispatchRequest,
  checkoutEquipment, returnEquipment, createSprayPlan, logApplicationComplete,
  addPackingRecord, addShippingRecord, markAlertRead,
  checkAndFireLowStockAlerts,
} from './agric-service';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface AgricState {
  inventory: AgricInventoryItem[];
  usageLogs: UsageLog[];
  requests: StockRequest[];
  checkouts: EquipmentCheckout[];
  plans: SprayPlan[];
  packingRecords: PackingRecord[];
  shippingRecords: ShippingRecord[];
  alerts: AgricAlert[];
  loading: boolean;
  error: string | null;
  isLive: boolean; // true = connected to Firestore
}

export interface AgricActions {
  // Inventory
  addItem: (item: Omit<AgricInventoryItem, 'id'>) => Promise<void>;
  updateItem: (id: string, fields: Partial<AgricInventoryItem>) => Promise<void>;
  deleteItem: (id: string, note: string) => Promise<void>;
  submitAdjustment: (adj: Omit<StockAdjustment, 'id'>) => Promise<void>;
  approveAdjustment: (adjId: string, itemId: string, newQty: number, note: string) => Promise<void>;
  // Usage
  logUsage: (log: Omit<UsageLog, 'id'>) => Promise<void>;
  // Requests
  createRequest: (req: Omit<StockRequest, 'id'>) => Promise<void>;
  approveRequest: (reqId: string) => Promise<void>;
  rejectRequest: (reqId: string, reason: string) => Promise<void>;
  dispatchReq: (reqId: string, items: Array<{ itemId: string; qty: number }>) => Promise<void>;
  confirmReceived: (reqId: string) => Promise<void>;
  // Equipment
  checkout: (item: Omit<EquipmentCheckout, 'id'>) => Promise<void>;
  returnItem: (checkoutId: string, condition: 'good' | 'damaged' | 'lost', notes?: string) => Promise<void>;
  // Plans
  createPlan: (plan: Omit<SprayPlan, 'id'>) => Promise<void>;
  markApplication: (planId: string, currentCompleted: number) => Promise<void>;
  // Packing
  addPacking: (record: Omit<PackingRecord, 'id'>) => Promise<void>;
  addShipping: (record: Omit<ShippingRecord, 'id'>) => Promise<void>;
  // Alerts
  readAlert: (alertId: string) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useAgric(): AgricState & AgricActions {
  const { user, organization } = useAppStore();
  const orgId = organization?.id ?? null;
  const userId = user?.id ?? null;
  const isLive = !!(orgId && userId);

  const [state, setState] = useState<AgricState>({
    inventory: isLive ? [] : MOCK_AGRIC_INVENTORY,
    usageLogs: [],
    requests: isLive ? [] : MOCK_STOCK_REQUESTS,
    checkouts: isLive ? [] : MOCK_EQUIPMENT_CHECKOUTS,
    plans: isLive ? [] : MOCK_SPRAY_PLANS,
    packingRecords: isLive ? [] : MOCK_PACKING_RECORDS,
    shippingRecords: isLive ? [] : MOCK_SHIPPING_RECORDS,
    alerts: isLive ? [] : MOCK_AGRIC_ALERTS,
    loading: isLive,
    error: null,
    isLive,
  });

  const unsubsRef = useRef<Array<() => void>>([]);

  // ── Wire up Firestore listeners ──────────────────────────
  useEffect(() => {
    // Tear down previous listeners
    unsubsRef.current.forEach(u => u());
    unsubsRef.current = [];

    if (!orgId || !userId) {
      // Not authenticated — use mock data
      setState(s => ({
        ...s,
        inventory: MOCK_AGRIC_INVENTORY,
        requests: MOCK_STOCK_REQUESTS,
        checkouts: MOCK_EQUIPMENT_CHECKOUTS,
        plans: MOCK_SPRAY_PLANS,
        packingRecords: MOCK_PACKING_RECORDS,
        shippingRecords: MOCK_SHIPPING_RECORDS,
        alerts: MOCK_AGRIC_ALERTS,
        loading: false, isLive: false,
      }));
      return;
    }

    setState(s => ({ ...s, loading: true, isLive: true }));
    let loaded = 0;
    const TOTAL_SUBS = 8;
    const onLoad = () => { loaded++; if (loaded >= TOTAL_SUBS) setState(s => ({ ...s, loading: false })); };
    const onErr = (e: Error) => setState(s => ({ ...s, error: e.message, loading: false }));

    // Seed on first load
    seedAgricInventory(orgId, userId, MOCK_AGRIC_INVENTORY.map(({ id: _id, ...rest }) => rest))
      .catch(console.warn);

    unsubsRef.current = [
      subscribeInventory(orgId, inv => { setState(s => ({ ...s, inventory: inv })); onLoad(); }, onErr),
      subscribeUsageLogs(orgId, logs => { setState(s => ({ ...s, usageLogs: logs })); onLoad(); }, onErr),
      subscribeRequests(orgId, reqs => { setState(s => ({ ...s, requests: reqs })); onLoad(); }, onErr),
      subscribeEquipment(orgId, ch => { setState(s => ({ ...s, checkouts: ch })); onLoad(); }, onErr),
      subscribePlans(orgId, plans => { setState(s => ({ ...s, plans })); onLoad(); }, onErr),
      subscribePackingToday(orgId, pr => { setState(s => ({ ...s, packingRecords: pr })); onLoad(); }, onErr),
      subscribeShipping(orgId, sr => { setState(s => ({ ...s, shippingRecords: sr })); onLoad(); }, onErr),
      subscribeAlerts(orgId, al => { setState(s => ({ ...s, alerts: al })); onLoad(); }, onErr),
    ];

    // Fire low-stock check on mount
    checkAndFireLowStockAlerts(orgId).catch(console.warn);

    return () => {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
    };
  }, [orgId, userId]);

  // ── Mock helpers (offline/demo mode) ────────────────────
  function mockUpdate<K extends keyof AgricState>(key: K, updater: (prev: AgricState[K]) => AgricState[K]) {
    setState(s => ({ ...s, [key]: updater(s[key]) }));
  }

  // ── Actions ──────────────────────────────────────────────
  const actions: AgricActions = {
    // Inventory
    addItem: useCallback(async (item) => {
      if (isLive) { await fsAddItem(orgId!, item, userId!); return; }
      mockUpdate('inventory', prev => [...(prev as AgricInventoryItem[]), { ...item, id: `item_${Date.now()}` }]);
    }, [isLive, orgId, userId]),

    updateItem: useCallback(async (id, fields) => {
      if (isLive) { await updateInventoryItem(orgId!, id, fields); return; }
      mockUpdate('inventory', prev => (prev as AgricInventoryItem[]).map(i => i.id === id ? { ...i, ...fields } : i));
    }, [isLive, orgId]),

    deleteItem: useCallback(async (id, note) => {
      if (isLive) { await softDeleteInventoryItem(orgId!, id, userId!, note); return; }
      mockUpdate('inventory', prev => (prev as AgricInventoryItem[]).map(i => i.id === id ? { ...i, isActive: false, deletedAt: new Date().toISOString(), deletedBy: userId ?? 'user', deletionNote: note } : i));
    }, [isLive, orgId, userId]),

    submitAdjustment: useCallback(async (adj) => {
      if (isLive) { await submitStockAdjustment(orgId!, adj); return; }
    }, [isLive, orgId]),

    approveAdjustment: useCallback(async (adjId, itemId, newQty, note) => {
      if (isLive) { await approveStockAdjustment(orgId!, adjId, itemId, newQty, userId!, note); return; }
      mockUpdate('inventory', prev => (prev as AgricInventoryItem[]).map(i => i.id === itemId ? { ...i, currentStock: newQty } : i));
    }, [isLive, orgId, userId]),

    // Usage
    logUsage: useCallback(async (log) => {
      if (isLive) { await addUsageLog(orgId!, log); return; }
      mockUpdate('usageLogs', prev => [{ ...log, id: `ul_${Date.now()}` }, ...(prev as UsageLog[])]);
      mockUpdate('inventory', prev => (prev as AgricInventoryItem[]).map(i => i.id === log.itemId ? { ...i, currentStock: Math.max(0, i.currentStock - log.quantity) } : i));
    }, [isLive, orgId]),

    // Requests
    createRequest: useCallback(async (req) => {
      if (isLive) { await createStockRequest(orgId!, req); return; }
      const yr = new Date().getFullYear();
      mockUpdate('requests', prev => [{ ...req, id: `sr_${Date.now()}`, requestNumber: `REQ-${yr}-${String((prev as StockRequest[]).length + 1).padStart(3, '0')}`, status: 'pending' as const }, ...(prev as StockRequest[])]);
    }, [isLive, orgId]),

    approveRequest: useCallback(async (reqId) => {
      if (isLive) { await updateRequestStatus(orgId!, reqId, { status: 'approved', approvedBy: userId!, approvedAt: new Date().toISOString() }); return; }
      mockUpdate('requests', prev => (prev as StockRequest[]).map(r => r.id === reqId ? { ...r, status: 'approved' as const, approvedBy: userId ?? '', approvedAt: new Date().toISOString() } : r));
    }, [isLive, orgId, userId]),

    rejectRequest: useCallback(async (reqId, reason) => {
      if (isLive) { await updateRequestStatus(orgId!, reqId, { status: 'rejected', rejectionReason: reason }); return; }
      mockUpdate('requests', prev => (prev as StockRequest[]).map(r => r.id === reqId ? { ...r, status: 'rejected' as const, rejectionReason: reason } : r));
    }, [isLive, orgId]),

    dispatchReq: useCallback(async (reqId, items) => {
      if (isLive) { await dispatchRequest(orgId!, reqId, userId!, items); return; }
      mockUpdate('requests', prev => (prev as StockRequest[]).map(r => r.id === reqId ? { ...r, status: 'dispatched' as const, dispatchedBy: userId ?? '', dispatchedAt: new Date().toISOString() } : r));
    }, [isLive, orgId, userId]),

    confirmReceived: useCallback(async (reqId) => {
      if (isLive) { await updateRequestStatus(orgId!, reqId, { status: 'received', receivedBy: userId!, receivedAt: new Date().toISOString() }); return; }
      mockUpdate('requests', prev => (prev as StockRequest[]).map(r => r.id === reqId ? { ...r, status: 'received' as const, receivedAt: new Date().toISOString() } : r));
    }, [isLive, orgId, userId]),

    // Equipment
    checkout: useCallback(async (item) => {
      if (isLive) { await checkoutEquipment(orgId!, item); return; }
      mockUpdate('checkouts', prev => [{ ...item, id: `ec_${Date.now()}` }, ...(prev as EquipmentCheckout[])]);
    }, [isLive, orgId]),

    returnItem: useCallback(async (checkoutId, condition, notes) => {
      if (isLive) { await returnEquipment(orgId!, checkoutId, condition, notes); return; }
      mockUpdate('checkouts', prev => (prev as EquipmentCheckout[]).map(c => c.id === checkoutId ? { ...c, isReturned: true, isOverdue: false, returnTime: new Date().toISOString(), returnedCondition: condition } : c));
    }, [isLive, orgId]),

    // Plans
    createPlan: useCallback(async (plan) => {
      if (isLive) { await createSprayPlan(orgId!, plan); return; }
      mockUpdate('plans', prev => [{ ...plan, id: `sp_${Date.now()}` }, ...(prev as SprayPlan[])]);
    }, [isLive, orgId]),

    markApplication: useCallback(async (planId, current) => {
      if (isLive) { await logApplicationComplete(orgId!, planId, current); return; }
      mockUpdate('plans', prev => (prev as SprayPlan[]).map(p => p.id === planId ? { ...p, completedApplications: Math.min(p.completedApplications + 1, p.totalApplications) } : p));
    }, [isLive, orgId]),

    // Packing
    addPacking: useCallback(async (record) => {
      if (isLive) { await addPackingRecord(orgId!, record); return; }
      mockUpdate('packingRecords', prev => [{ ...record, id: `pr_${Date.now()}` }, ...(prev as PackingRecord[])]);
    }, [isLive, orgId]),

    addShipping: useCallback(async (record) => {
      if (isLive) { await addShippingRecord(orgId!, record); return; }
      mockUpdate('shippingRecords', prev => [{ ...record, id: `sh_${Date.now()}` }, ...(prev as ShippingRecord[])]);
    }, [isLive, orgId]),

    // Alerts
    readAlert: useCallback(async (alertId) => {
      if (isLive) { await markAlertRead(orgId!, alertId); return; }
      mockUpdate('alerts', prev => (prev as AgricAlert[]).map(a => a.id === alertId ? { ...a, isRead: true } : a));
    }, [isLive, orgId]),
  };

  return { ...state, ...actions };
}
