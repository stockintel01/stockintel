/**
 * useAgric.ts
 *
 * Central React hook for the Agriculture module.
 * - Connects to tenant-scoped Firestore data in production
 * - Requires an authenticated organization for every write
 * - Exposes typed state + actions to all agric pages
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import type {
  AgricInventoryItem, UsageLog, StockRequest, EquipmentCheckout,
  SprayPlan, PackingRecord, ShippingRecord, AgricAlert, StockAdjustment,
} from './types';
import {
  subscribeInventory, subscribeUsageLogs, subscribeRequests,
  subscribeEquipment, subscribePlans, subscribePackingToday,
  subscribeShipping, subscribeAlerts,
  addInventoryItem as fsAddItem, updateInventoryItem, softDeleteInventoryItem,
  submitStockAdjustment, approveStockAdjustment,
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
    inventory: [],
    usageLogs: [],
    requests: [],
    checkouts: [],
    plans: [],
    packingRecords: [],
    shippingRecords: [],
    alerts: [],
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
      // Not authenticated: keep state empty and block writes.
      setState(s => ({
        ...s,
        inventory: [],
        requests: [],
        checkouts: [],
        plans: [],
        packingRecords: [],
        shippingRecords: [],
        alerts: [],
        loading: false, isLive: false, error: 'An authenticated organization is required.',
      }));
      return;
    }

    setState(s => ({ ...s, loading: true, isLive: true }));
    let loaded = 0;
    const TOTAL_SUBS = 8;
    const onLoad = () => { loaded++; if (loaded >= TOTAL_SUBS) setState(s => ({ ...s, loading: false })); };
    const onErr = (e: Error) => setState(s => ({ ...s, error: e.message, loading: false }));

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

  // ── Production write guard ──────────────────────────────
  const requireLiveContext = useCallback(() => {
    if (!orgId || !userId) throw new Error('An authenticated organization is required.');
    return { orgId, userId };
  }, [orgId, userId]);

  // ── Actions ──────────────────────────────────────────────
  const actions: AgricActions = {
    // Inventory
    addItem: useCallback(async (item) => {
      const ctx = requireLiveContext();
      await fsAddItem(ctx.orgId, item, ctx.userId);
    }, [requireLiveContext]),

    updateItem: useCallback(async (id, fields) => {
      const ctx = requireLiveContext();
      await updateInventoryItem(ctx.orgId, id, fields);
    }, [requireLiveContext]),

    deleteItem: useCallback(async (id, note) => {
      const ctx = requireLiveContext();
      await softDeleteInventoryItem(ctx.orgId, id, ctx.userId, note);
    }, [requireLiveContext]),

    submitAdjustment: useCallback(async (adj) => {
      const ctx = requireLiveContext();
      await submitStockAdjustment(ctx.orgId, adj);
    }, [requireLiveContext]),

    approveAdjustment: useCallback(async (adjId, itemId, newQty, note) => {
      const ctx = requireLiveContext();
      await approveStockAdjustment(ctx.orgId, adjId, itemId, newQty, ctx.userId, note);
    }, [requireLiveContext]),

    // Usage
    logUsage: useCallback(async (log) => {
      const ctx = requireLiveContext();
      await addUsageLog(ctx.orgId, log);
    }, [requireLiveContext]),

    // Requests
    createRequest: useCallback(async (req) => {
      const ctx = requireLiveContext();
      await createStockRequest(ctx.orgId, req);
    }, [requireLiveContext]),

    approveRequest: useCallback(async (reqId) => {
      const ctx = requireLiveContext();
      await updateRequestStatus(ctx.orgId, reqId, { status: 'approved', approvedBy: ctx.userId, approvedAt: new Date().toISOString() });
    }, [requireLiveContext]),

    rejectRequest: useCallback(async (reqId, reason) => {
      const ctx = requireLiveContext();
      await updateRequestStatus(ctx.orgId, reqId, { status: 'rejected', rejectionReason: reason });
    }, [requireLiveContext]),

    dispatchReq: useCallback(async (reqId, items) => {
      const ctx = requireLiveContext();
      await dispatchRequest(ctx.orgId, reqId, ctx.userId, items);
    }, [requireLiveContext]),

    confirmReceived: useCallback(async (reqId) => {
      const ctx = requireLiveContext();
      await updateRequestStatus(ctx.orgId, reqId, { status: 'received', receivedBy: ctx.userId, receivedAt: new Date().toISOString() });
    }, [requireLiveContext]),

    // Equipment
    checkout: useCallback(async (item) => {
      const ctx = requireLiveContext();
      await checkoutEquipment(ctx.orgId, item);
    }, [requireLiveContext]),

    returnItem: useCallback(async (checkoutId, condition, notes) => {
      const ctx = requireLiveContext();
      await returnEquipment(ctx.orgId, checkoutId, condition, notes);
    }, [requireLiveContext]),

    // Plans
    createPlan: useCallback(async (plan) => {
      const ctx = requireLiveContext();
      await createSprayPlan(ctx.orgId, plan);
    }, [requireLiveContext]),

    markApplication: useCallback(async (planId, current) => {
      const ctx = requireLiveContext();
      await logApplicationComplete(ctx.orgId, planId, current);
    }, [requireLiveContext]),

    // Packing
    addPacking: useCallback(async (record) => {
      const ctx = requireLiveContext();
      await addPackingRecord(ctx.orgId, record);
    }, [requireLiveContext]),

    addShipping: useCallback(async (record) => {
      const ctx = requireLiveContext();
      await addShippingRecord(ctx.orgId, record);
    }, [requireLiveContext]),

    // Alerts
    readAlert: useCallback(async (alertId) => {
      const ctx = requireLiveContext();
      await markAlertRead(ctx.orgId, alertId);
    }, [requireLiveContext]),
  };

  return { ...state, ...actions };
}
