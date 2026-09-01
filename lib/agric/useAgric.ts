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
import { userHasAccess } from '@/lib/access-permissions';
import type {
  AgricInventoryItem, UsageLog, StockRequest, EquipmentCheckout,
  SprayPlan, PackingRecord, ShippingRecord, AgricAlert, StockAdjustment,
  RequestReturnCondition, PackingFulfilmentPlan, PackingCrewProfile, PackingTransportProfile,
  PackingQualityConfig, PackingQualityEvent, PackingInspectionStatus,
} from './types';
import {
  subscribeInventory, subscribeUsageLogs, subscribeRequests,
  subscribeEquipment, subscribePlans, subscribePackingToday,
  subscribeShipping, subscribeAlerts,
  addInventoryItem as fsAddItem, updateInventoryItem, softDeleteInventoryItem,
  submitStockAdjustment, approveStockAdjustment,
  addUsageLog, createStockRequest, updateRequestStatus, dispatchRequest,
  recordRequestIssueUsage, returnRequestIssue,
  checkoutEquipment, returnEquipment, createSprayPlan, logApplicationComplete, confirmRequestReceipt,
  addPackingRecord, updatePackingRecord, deletePackingRecord, addShippingRecord, markAlertRead,
  checkAndFireLowStockAlerts,
} from './agric-service';
import {
  deletePackingCrewProfile, deletePackingTransportProfile, savePackingCrewProfile,
  savePackingFulfilmentPlan, savePackingQualityConfig, savePackingTransportProfile, setPackingPlanStatus,
  recordPackingQualityEvent, subscribePackingCrewProfiles, subscribePackingFulfilmentPlans,
  subscribePackingQualityConfig, subscribePackingQualityEvents, subscribePackingTransportProfiles,
} from './packing-service';

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
  packingPlans: PackingFulfilmentPlan[];
  packingCrews: PackingCrewProfile[];
  packingTransportProfiles: PackingTransportProfile[];
  packingQualityEvents: PackingQualityEvent[];
  packingQualityConfig: PackingQualityConfig | null;
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
  saveRequestDraft: (reqId: string, fields: Partial<StockRequest>) => Promise<void>;
  approveRequest: (reqId: string) => Promise<void>;
  submitDraftRequest: (reqId: string) => Promise<void>;
  rejectRequest: (reqId: string, reason: string) => Promise<void>;
  dispatchReq: (reqId: string, items: Array<{ itemId: string; qty: number }>, options: {
    issueDate: string;
    issuedToName?: string;
    expectedReturnDate?: string;
    notes?: string;
    recordConsumablesAsUsed?: boolean;
    weekStartsOn?: number;
  }) => Promise<void>;
  confirmReceived: (reqId: string) => Promise<void>;
  markIssueUsed: (reqId: string, issueId: string, usedDate: string, weekStartsOn?: number) => Promise<void>;
  returnIssuedItem: (reqId: string, issueId: string, quantity: number, condition: RequestReturnCondition, notes?: string) => Promise<void>;
  // Equipment
  checkout: (item: Omit<EquipmentCheckout, 'id'>) => Promise<void>;
  returnItem: (checkoutId: string, condition: 'good' | 'damaged' | 'lost', notes?: string) => Promise<void>;
  // Plans
  createPlan: (plan: Omit<SprayPlan, 'id'>) => Promise<void>;
  markApplication: (planId: string, appliedAt?: string, notes?: string) => Promise<void>;
  // Packing
  addPacking: (record: Omit<PackingRecord, 'id'>) => Promise<void>;
  updatePacking: (id: string, changes: Partial<Omit<PackingRecord, 'id'>>) => Promise<void>;
  deletePacking: (id: string) => Promise<void>;
  addShipping: (record: Omit<ShippingRecord, 'id'>) => Promise<void>;
  savePackingPlan: (plan: Omit<PackingFulfilmentPlan, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => Promise<void>;
  setPackingPlanStatus: (id: string, status: PackingFulfilmentPlan['status']) => Promise<void>;
  savePackingCrew: (profile: Omit<PackingCrewProfile, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => Promise<void>;
  deletePackingCrew: (id: string) => Promise<void>;
  savePackingTransport: (profile: Omit<PackingTransportProfile, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => Promise<void>;
  deletePackingTransport: (id: string) => Promise<void>;
  recordPackingQuality: (event: Omit<PackingQualityEvent, 'id' | 'createdAt'>, status: PackingInspectionStatus) => Promise<void>;
  savePackingQualitySettings: (config: Omit<PackingQualityConfig, 'id' | 'updatedAt'>) => Promise<void>;
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
  const canInventory = userHasAccess(user, 'agricStock') || userHasAccess(user, 'agricReports') || userHasAccess(user, 'agricRequests') || userHasAccess(user, 'agricUsage') || userHasAccess(user, 'agricPlanner');
  const canManageInventory = userHasAccess(user, 'agricStock');
  const canUsage = userHasAccess(user, 'agricUsage') || userHasAccess(user, 'agricReports');
  const canRequests = userHasAccess(user, 'agricRequests');
  const canEquipment = userHasAccess(user, 'agricEquipment') || userHasAccess(user, 'agricReports');
  const canPlans = userHasAccess(user, 'agricPlanner') || userHasAccess(user, 'agricReports');
  const canPacking = userHasAccess(user, 'agricPacking') || userHasAccess(user, 'agricReports');

  const [state, setState] = useState<AgricState>({
    inventory: [],
    usageLogs: [],
    requests: [],
    checkouts: [],
    plans: [],
    packingRecords: [],
    shippingRecords: [],
    packingPlans: [],
    packingCrews: [],
    packingTransportProfiles: [],
    packingQualityEvents: [],
    packingQualityConfig: null,
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
        packingPlans: [], packingCrews: [], packingTransportProfiles: [], packingQualityEvents: [], packingQualityConfig: null,
        alerts: [],
        loading: false, isLive: false, error: 'An authenticated organization is required.',
      }));
      return;
    }

    setState(s => ({
      ...s,
      inventory: [], usageLogs: [], requests: [], checkouts: [], plans: [],
      packingRecords: [], shippingRecords: [], packingPlans: [], packingCrews: [], packingTransportProfiles: [], packingQualityEvents: [], packingQualityConfig: null, alerts: [],
      loading: true, error: null, isLive: true,
    }));
    let loaded = 0;
    const totalSubscriptions = Number(canInventory) + Number(canUsage) + Number(canRequests) + Number(canEquipment) + Number(canPlans) + Number(canPacking) * 7 + 1;
    const onLoad = () => { loaded++; if (loaded >= totalSubscriptions) setState(s => ({ ...s, loading: false })); };
    const onErr = (e: Error) => setState(s => ({ ...s, error: e.message, loading: false }));

    const subscriptions: Array<() => void> = [];
    if (canInventory) subscriptions.push(subscribeInventory(orgId, inv => { setState(s => ({ ...s, inventory: inv })); onLoad(); }, onErr));
    if (canUsage) subscriptions.push(subscribeUsageLogs(orgId, logs => { setState(s => ({ ...s, usageLogs: logs })); onLoad(); }, onErr));
    if (canRequests) subscriptions.push(subscribeRequests(orgId, ['owner', 'manager', 'super_admin'].includes(user?.role ?? ''), reqs => { setState(s => ({ ...s, requests: reqs })); onLoad(); }, onErr));
    if (canEquipment) subscriptions.push(subscribeEquipment(orgId, ch => { setState(s => ({ ...s, checkouts: ch })); onLoad(); }, onErr));
    if (canPlans) subscriptions.push(subscribePlans(orgId, plans => { setState(s => ({ ...s, plans })); onLoad(); }, onErr));
    if (canPacking) {
      subscriptions.push(subscribePackingToday(orgId, pr => { setState(s => ({ ...s, packingRecords: pr })); onLoad(); }, onErr));
      subscriptions.push(subscribeShipping(orgId, sr => { setState(s => ({ ...s, shippingRecords: sr })); onLoad(); }, onErr));
      subscriptions.push(subscribePackingFulfilmentPlans(orgId, plans => { setState(s => ({ ...s, packingPlans: plans })); onLoad(); }, onErr));
      subscriptions.push(subscribePackingCrewProfiles(orgId, crews => { setState(s => ({ ...s, packingCrews: crews })); onLoad(); }, onErr));
      subscriptions.push(subscribePackingTransportProfiles(orgId, profiles => { setState(s => ({ ...s, packingTransportProfiles: profiles })); onLoad(); }, onErr));
      subscriptions.push(subscribePackingQualityEvents(orgId, events => { setState(s => ({ ...s, packingQualityEvents: events })); onLoad(); }, onErr));
      subscriptions.push(subscribePackingQualityConfig(orgId, config => { setState(s => ({ ...s, packingQualityConfig: config })); onLoad(); }, onErr));
    }
    subscriptions.push(subscribeAlerts(orgId, al => { setState(s => ({ ...s, alerts: al })); onLoad(); }, onErr));
    unsubsRef.current = subscriptions;

    // Fire low-stock check on mount
    if (canManageInventory) checkAndFireLowStockAlerts(orgId).catch(console.warn);

    return () => {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
    };
  }, [canEquipment, canInventory, canManageInventory, canPacking, canPlans, canRequests, canUsage, orgId, user?.role, userId]);

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

    saveRequestDraft: useCallback(async (reqId, fields) => {
      const ctx = requireLiveContext();
      await updateRequestStatus(ctx.orgId, reqId, fields);
    }, [requireLiveContext]),

    approveRequest: useCallback(async (reqId) => {
      const ctx = requireLiveContext();
      await updateRequestStatus(ctx.orgId, reqId, { status: 'approved', approvedBy: ctx.userId, approvedAt: new Date().toISOString() });
    }, [requireLiveContext]),

    submitDraftRequest: useCallback(async (reqId) => {
      const ctx = requireLiveContext();
      await updateRequestStatus(ctx.orgId, reqId, { status: 'pending' });
    }, [requireLiveContext]),

    rejectRequest: useCallback(async (reqId, reason) => {
      const ctx = requireLiveContext();
      await updateRequestStatus(ctx.orgId, reqId, { status: 'rejected', rejectionReason: reason });
    }, [requireLiveContext]),

    dispatchReq: useCallback(async (reqId, items, options) => {
      const ctx = requireLiveContext();
      await dispatchRequest(ctx.orgId, reqId, ctx.userId, items, options);
    }, [requireLiveContext]),

    confirmReceived: useCallback(async (reqId) => {
      const ctx = requireLiveContext();
      await confirmRequestReceipt(ctx.orgId, reqId, ctx.userId);
    }, [requireLiveContext]),

    markIssueUsed: useCallback(async (reqId, issueId, usedDate, weekStartsOn = 0) => {
      const ctx = requireLiveContext();
      await recordRequestIssueUsage(ctx.orgId, reqId, issueId, ctx.userId, usedDate, weekStartsOn);
    }, [requireLiveContext]),

    returnIssuedItem: useCallback(async (reqId, issueId, quantity, condition, notes) => {
      const ctx = requireLiveContext();
      await returnRequestIssue(ctx.orgId, reqId, issueId, quantity, condition, ctx.userId, notes);
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

    markApplication: useCallback(async (planId, appliedAt = new Date().toISOString().slice(0, 10), notes) => {
      const ctx = requireLiveContext();
      await logApplicationComplete(ctx.orgId, planId, appliedAt, ctx.userId, notes);
    }, [requireLiveContext]),

    // Packing
    addPacking: useCallback(async (record) => {
      const ctx = requireLiveContext();
      await addPackingRecord(ctx.orgId, record);
    }, [requireLiveContext]),

    updatePacking: useCallback(async (id, changes) => {
      const ctx = requireLiveContext();
      await updatePackingRecord(ctx.orgId, id, changes);
    }, [requireLiveContext]),

    deletePacking: useCallback(async (id) => {
      const ctx = requireLiveContext();
      await deletePackingRecord(ctx.orgId, id);
    }, [requireLiveContext]),

    addShipping: useCallback(async (record) => {
      const ctx = requireLiveContext();
      await addShippingRecord(ctx.orgId, record);
    }, [requireLiveContext]),

    savePackingPlan: useCallback(async (plan, id) => {
      const ctx = requireLiveContext();
      await savePackingFulfilmentPlan(ctx.orgId, plan, id);
    }, [requireLiveContext]),

    setPackingPlanStatus: useCallback(async (id, status) => {
      const ctx = requireLiveContext();
      await setPackingPlanStatus(ctx.orgId, id, status);
    }, [requireLiveContext]),

    savePackingCrew: useCallback(async (profile, id) => {
      const ctx = requireLiveContext();
      await savePackingCrewProfile(ctx.orgId, profile, id);
    }, [requireLiveContext]),

    deletePackingCrew: useCallback(async (id) => {
      const ctx = requireLiveContext();
      await deletePackingCrewProfile(ctx.orgId, id);
    }, [requireLiveContext]),

    savePackingTransport: useCallback(async (profile, id) => {
      const ctx = requireLiveContext();
      await savePackingTransportProfile(ctx.orgId, profile, id);
    }, [requireLiveContext]),

    deletePackingTransport: useCallback(async (id) => {
      const ctx = requireLiveContext();
      await deletePackingTransportProfile(ctx.orgId, id);
    }, [requireLiveContext]),

    recordPackingQuality: useCallback(async (event, status) => {
      const ctx = requireLiveContext();
      await recordPackingQualityEvent(ctx.orgId, event, status);
    }, [requireLiveContext]),

    savePackingQualitySettings: useCallback(async (config) => {
      const ctx = requireLiveContext();
      await savePackingQualityConfig(ctx.orgId, config);
    }, [requireLiveContext]),

    // Alerts
    readAlert: useCallback(async (alertId) => {
      const ctx = requireLiveContext();
      await markAlertRead(ctx.orgId, alertId);
    }, [requireLiveContext]),
  };

  return { ...state, ...actions };
}
