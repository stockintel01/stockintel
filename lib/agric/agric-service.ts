/**
 * agric-service.ts
 *
 * Firestore service layer for the Agriculture module.
 *
 * Data paths:
 *   organizations/{orgId}/agric_inventory/{itemId}
 *   organizations/{orgId}/agric_usage/{logId}
 *   organizations/{orgId}/agric_requests/{reqId}
 *   organizations/{orgId}/agric_equipment/{checkoutId}
 *   organizations/{orgId}/agric_plans/{planId}
 *   organizations/{orgId}/agric_packing/{recordId}
 *   organizations/{orgId}/agric_shipping/{recordId}
 *   organizations/{orgId}/agric_adjustments/{adjId}
 *   organizations/{orgId}/agric_alerts/{alertId}
 */

import {
  collection, doc, onSnapshot, addDoc, updateDoc, setDoc,
  getDocs, query, orderBy, where, serverTimestamp,
  runTransaction, writeBatch, increment, Timestamp, limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  AgricInventoryItem, UsageLog, StockRequest, EquipmentCheckout,
  SprayPlan, PackingRecord, ShippingRecord, StockAdjustment,
  AgricAlert, AgricCategory, FarmZone,
} from './types';

// ─────────────────────────────────────────────────────────────
// Collection helpers
// ─────────────────────────────────────────────────────────────

const col = (orgId: string, name: string) =>
  collection(db, `organizations/${orgId}/${name}`);

const ref = (orgId: string, name: string, id: string) =>
  doc(db, `organizations/${orgId}/${name}/${id}`);

type Unsub = () => void;

// Strip undefined values Firestore doesn't accept
function clean<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

// ─────────────────────────────────────────────────────────────
// INVENTORY
// ─────────────────────────────────────────────────────────────

export function subscribeInventory(
  orgId: string,
  onData: (items: AgricInventoryItem[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  const q = query(col(orgId, 'agric_inventory'), where('isActive', '==', true), orderBy('category'), orderBy('name'));
  return onSnapshot(q,
    snap => onData(snap.docs.map(d => ({ ...d.data(), id: d.id } as AgricInventoryItem))),
    err => { console.error('[agric] inventory:', err); onErr?.(err); },
  );
}

export async function addInventoryItem(
  orgId: string, item: Omit<AgricInventoryItem, 'id'>, userId: string,
): Promise<string> {
  const r = await addDoc(col(orgId, 'agric_inventory'), {
    ...clean(item),
    createdBy: userId,
    isActive: true,
    lastUpdated: new Date().toISOString().slice(0, 10),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return r.id;
}

export async function updateInventoryItem(
  orgId: string, itemId: string, fields: Partial<AgricInventoryItem>,
): Promise<void> {
  await updateDoc(ref(orgId, 'agric_inventory', itemId), {
    ...clean(fields),
    lastUpdated: new Date().toISOString().slice(0, 10),
    updatedAt: serverTimestamp(),
  });
}

/** Soft-delete — always keep audit trail; manager sees deletion log */
export async function softDeleteInventoryItem(
  orgId: string, itemId: string, deletedBy: string, note: string,
): Promise<void> {
  await updateDoc(ref(orgId, 'agric_inventory', itemId), {
    isActive: false,
    deletedAt: new Date().toISOString(),
    deletedBy,
    deletionNote: note,
    updatedAt: serverTimestamp(),
  });
  // Write to deletion audit log
  await addDoc(col(orgId, 'agric_deletion_log'), {
    itemId, deletedBy, note,
    deletedAt: serverTimestamp(),
  });
}

/** Atomic stock adjustment — requires approval workflow */
export async function submitStockAdjustment(
  orgId: string, adj: Omit<StockAdjustment, 'id'>,
): Promise<string> {
  const r = await addDoc(col(orgId, 'agric_adjustments'), {
    ...clean(adj),
    status: 'pending_approval',
    requestDate: new Date().toISOString(),
    createdAt: serverTimestamp(),
  });
  return r.id;
}

export async function approveStockAdjustment(
  orgId: string, adjId: string, itemId: string,
  newQty: number, reviewedBy: string, reviewNote: string,
): Promise<void> {
  await runTransaction(db, async tx => {
    const adjRef = ref(orgId, 'agric_adjustments', adjId);
    const itemDocRef = ref(orgId, 'agric_inventory', itemId);
    tx.update(adjRef, { status: 'approved', reviewedBy, reviewNote, reviewedAt: new Date().toISOString() });
    tx.update(itemDocRef, {
      currentStock: newQty,
      lastUpdated: new Date().toISOString().slice(0, 10),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Seed starter inventory for brand-new farm org */
export async function seedAgricInventory(
  orgId: string, userId: string, items: Omit<AgricInventoryItem, 'id'>[],
): Promise<void> {
  const existing = await getDocs(query(col(orgId, 'agric_inventory'), limit(1)));
  if (!existing.empty) return;
  const CHUNK = 499;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + CHUNK)) {
      const docRef = doc(col(orgId, 'agric_inventory'));
      batch.set(docRef, {
        ...clean(item),
        createdBy: userId,
        isActive: true,
        lastUpdated: new Date().toISOString().slice(0, 10),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

// ─────────────────────────────────────────────────────────────
// USAGE LOGS
// ─────────────────────────────────────────────────────────────

export function subscribeUsageLogs(
  orgId: string,
  onData: (logs: UsageLog[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  const q = query(col(orgId, 'agric_usage'), orderBy('date', 'desc'), limit(500));
  return onSnapshot(q,
    snap => onData(snap.docs.map(d => ({ ...d.data(), id: d.id } as UsageLog))),
    err => { console.error('[agric] usage:', err); onErr?.(err); },
  );
}

export async function addUsageLog(
  orgId: string,
  log: Omit<UsageLog, 'id'>,
): Promise<void> {
  // Also decrement inventory stock atomically
  await runTransaction(db, async tx => {
    const invRef = ref(orgId, 'agric_inventory', log.itemId);
    const invSnap = await tx.get(invRef);
    if (invSnap.exists()) {
      const current = (invSnap.data().currentStock as number) ?? 0;
      if (current - log.quantity < 0) throw new Error(`Insufficient stock: ${current} ${log.uom} available`);
      tx.update(invRef, {
        currentStock: increment(-log.quantity),
        lastUpdated: new Date().toISOString().slice(0, 10),
        updatedAt: serverTimestamp(),
      });
    }
    const logRef = doc(col(orgId, 'agric_usage'));
    tx.set(logRef, {
      ...clean(log),
      createdAt: serverTimestamp(),
    });
  });
}

// ─────────────────────────────────────────────────────────────
// STOCK REQUESTS
// ─────────────────────────────────────────────────────────────

export function subscribeRequests(
  orgId: string,
  onData: (reqs: StockRequest[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  const q = query(col(orgId, 'agric_requests'), orderBy('requestDate', 'desc'), limit(200));
  return onSnapshot(q,
    snap => onData(snap.docs.map(d => ({ ...d.data(), id: d.id } as StockRequest))),
    err => { console.error('[agric] requests:', err); onErr?.(err); },
  );
}

export async function createStockRequest(
  orgId: string,
  req: Omit<StockRequest, 'id'>,
): Promise<string> {
  // Generate request number: REQ-{YEAR}-{sequential padded}
  const year = new Date().getFullYear();
  const existing = await getDocs(query(col(orgId, 'agric_requests')));
  const num = String(existing.size + 1).padStart(3, '0');
  const r = await addDoc(col(orgId, 'agric_requests'), {
    ...clean(req),
    requestNumber: `REQ-${year}-${num}`,
    status: 'pending',
    requestDate: new Date().toISOString(),
    createdAt: serverTimestamp(),
  });
  // Create alert for storekeepers
  await addAgricAlert(orgId, {
    type: 'restock_request',
    severity: req.priority === 'urgent' ? 'critical' : 'info',
    title: `New ${req.priority === 'urgent' ? 'URGENT ' : ''}Request: REQ-${year}-${num}`,
    message: `${req.requestedByName} requested ${req.items.length} item(s) for ${req.farmZone} zone.`,
    createdAt: new Date().toISOString(),
    isRead: false,
    isActionRequired: true,
  });
  return r.id;
}

export async function updateRequestStatus(
  orgId: string,
  reqId: string,
  fields: Partial<StockRequest>,
): Promise<void> {
  await updateDoc(ref(orgId, 'agric_requests', reqId), {
    ...clean(fields),
    updatedAt: serverTimestamp(),
  });
}

/** Dispatch: decrements live inventory for each dispatched item */
export async function dispatchRequest(
  orgId: string,
  reqId: string,
  dispatchedBy: string,
  dispatchedItems: Array<{ itemId: string; qty: number }>,
): Promise<void> {
  await runTransaction(db, async tx => {
    // Verify stock for each item
    for (const di of dispatchedItems) {
      const invRef = ref(orgId, 'agric_inventory', di.itemId);
      const snap = await tx.get(invRef);
      if (!snap.exists()) continue;
      const current = (snap.data().currentStock as number) ?? 0;
      if (current - di.qty < 0) throw new Error(`Insufficient stock for item ${di.itemId}`);
      tx.update(invRef, {
        currentStock: increment(-di.qty),
        lastUpdated: new Date().toISOString().slice(0, 10),
        updatedAt: serverTimestamp(),
      });
    }
    const reqRef = ref(orgId, 'agric_requests', reqId);
    tx.update(reqRef, {
      status: 'dispatched',
      dispatchedBy,
      dispatchedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  });
}

// ─────────────────────────────────────────────────────────────
// EQUIPMENT CHECKOUTS
// ─────────────────────────────────────────────────────────────

export function subscribeEquipment(
  orgId: string,
  onData: (checkouts: EquipmentCheckout[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  // Today only for real-time tracking; historical via reports
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const q = query(
    col(orgId, 'agric_equipment'),
    where('checkoutTime', '>=', startOfDay.toISOString()),
    orderBy('checkoutTime', 'desc'),
  );
  return onSnapshot(q,
    snap => onData(snap.docs.map(d => ({ ...d.data(), id: d.id } as EquipmentCheckout))),
    err => { console.error('[agric] equipment:', err); onErr?.(err); },
  );
}

export async function checkoutEquipment(
  orgId: string, checkout: Omit<EquipmentCheckout, 'id'>,
): Promise<string> {
  const r = await addDoc(col(orgId, 'agric_equipment'), {
    ...clean(checkout),
    isReturned: false,
    isOverdue: false,
    createdAt: serverTimestamp(),
  });
  return r.id;
}

export async function returnEquipment(
  orgId: string,
  checkoutId: string,
  condition: 'good' | 'damaged' | 'lost',
  notes?: string,
): Promise<void> {
  await updateDoc(ref(orgId, 'agric_equipment', checkoutId), {
    isReturned: true,
    isOverdue: false,
    returnTime: new Date().toISOString(),
    returnedCondition: condition,
    ...(notes ? { notes } : {}),
    updatedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────
// SPRAY PLANS
// ─────────────────────────────────────────────────────────────

export function subscribePlans(
  orgId: string,
  onData: (plans: SprayPlan[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  const q = query(col(orgId, 'agric_plans'), orderBy('createdAt', 'desc'));
  return onSnapshot(q,
    snap => onData(snap.docs.map(d => ({ ...d.data(), id: d.id } as SprayPlan))),
    err => { console.error('[agric] plans:', err); onErr?.(err); },
  );
}

export async function createSprayPlan(
  orgId: string, plan: Omit<SprayPlan, 'id'>,
): Promise<string> {
  const r = await addDoc(col(orgId, 'agric_plans'), {
    ...clean(plan),
    status: 'active',
    completedApplications: 0,
    restockAlertSent: false,
    createdAt: serverTimestamp(),
  });
  // Fire alerts for shortfall items
  for (const item of plan.items.filter(i => !i.isStockSufficient)) {
    await addAgricAlert(orgId, {
      type: 'plan_shortfall',
      severity: 'warning',
      title: `Plan Shortfall: ${item.itemName}`,
      message: `${plan.planName}: stock insufficient for ${item.itemName}. Need ${item.totalPlannedQty} ${item.uom}, have ${item.currentStockAtPlanTime}. Restock by ${item.restockAlertDate ?? 'ASAP'}.`,
      itemId: item.itemId,
      itemName: item.itemName,
      createdAt: new Date().toISOString(),
      isRead: false,
      isActionRequired: true,
    });
  }
  return r.id;
}

export async function logApplicationComplete(
  orgId: string, planId: string, currentCompleted: number,
): Promise<void> {
  await updateDoc(ref(orgId, 'agric_plans', planId), {
    completedApplications: increment(1),
    updatedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────
// PACKING STATION
// ─────────────────────────────────────────────────────────────

export function subscribePackingToday(
  orgId: string,
  onData: (records: PackingRecord[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  const today = new Date().toISOString().slice(0, 10);
  const q = query(col(orgId, 'agric_packing'), where('date', '==', today), orderBy('stationName'));
  return onSnapshot(q,
    snap => onData(snap.docs.map(d => ({ ...d.data(), id: d.id } as PackingRecord))),
    err => { console.error('[agric] packing:', err); onErr?.(err); },
  );
}

export async function addPackingRecord(
  orgId: string, record: Omit<PackingRecord, 'id'>,
): Promise<string> {
  const r = await addDoc(col(orgId, 'agric_packing'), {
    ...clean(record),
    createdAt: serverTimestamp(),
  });
  return r.id;
}

// ─────────────────────────────────────────────────────────────
// SHIPPING
// ─────────────────────────────────────────────────────────────

export function subscribeShipping(
  orgId: string,
  onData: (records: ShippingRecord[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  const q = query(col(orgId, 'agric_shipping'), orderBy('dispatchDate', 'desc'), limit(100));
  return onSnapshot(q,
    snap => onData(snap.docs.map(d => ({ ...d.data(), id: d.id } as ShippingRecord))),
    err => { console.error('[agric] shipping:', err); onErr?.(err); },
  );
}

export async function addShippingRecord(
  orgId: string, record: Omit<ShippingRecord, 'id'>,
): Promise<string> {
  const r = await addDoc(col(orgId, 'agric_shipping'), {
    ...clean(record),
    createdAt: serverTimestamp(),
  });
  return r.id;
}

// ─────────────────────────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────────────────────────

export function subscribeAlerts(
  orgId: string,
  onData: (alerts: AgricAlert[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  const q = query(col(orgId, 'agric_alerts'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(q,
    snap => onData(snap.docs.map(d => ({ ...d.data(), id: d.id } as AgricAlert))),
    err => { console.error('[agric] alerts:', err); onErr?.(err); },
  );
}

export async function addAgricAlert(
  orgId: string, alert: Omit<AgricAlert, 'id'>,
): Promise<void> {
  await addDoc(col(orgId, 'agric_alerts'), {
    ...clean(alert),
    createdAt: serverTimestamp(),
  });
}

export async function markAlertRead(orgId: string, alertId: string): Promise<void> {
  await updateDoc(ref(orgId, 'agric_alerts', alertId), {
    isRead: true, updatedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────────────────────
// LOW-STOCK CHECKER (call on app load and after each usage log)
// ─────────────────────────────────────────────────────────────

export async function checkAndFireLowStockAlerts(orgId: string): Promise<void> {
  const items = await getDocs(query(
    col(orgId, 'agric_inventory'),
    where('isActive', '==', true),
  ));
  for (const d of items.docs) {
    const item = d.data() as AgricInventoryItem;
    const stock = item.currentStock ?? 0;
    const min = item.minimumStock ?? 0;
    if (stock > min) continue;

    const severity = stock === 0 ? 'critical' : stock <= min * 0.5 ? 'critical' : 'warning';
    // Don't spam — check if unread alert already exists for this item
    const existing = await getDocs(query(
      col(orgId, 'agric_alerts'),
      where('itemId', '==', d.id),
      where('isRead', '==', false),
      where('type', '==', 'low_stock'),
      limit(1),
    ));
    if (!existing.empty) continue;

    await addAgricAlert(orgId, {
      type: 'low_stock',
      severity,
      title: `${severity === 'critical' ? 'Critical' : 'Low'} Stock: ${item.name}`,
      message: `${item.name} is at ${stock} ${item.uom} (minimum: ${min} ${item.uom}). Restock soon.`,
      itemId: d.id,
      itemName: item.name,
      createdAt: new Date().toISOString(),
      isRead: false,
      isActionRequired: severity === 'critical',
    });
  }
}

// ─────────────────────────────────────────────────────────────
// REPORTS — fetch snapshots for report generation
// ─────────────────────────────────────────────────────────────

export async function fetchReportData(orgId: string, startDate: string, endDate: string) {
  const [invSnap, usageSnap, packingSnap, shippingSnap, equipSnap] = await Promise.all([
    getDocs(query(col(orgId, 'agric_inventory'), where('isActive', '==', true), orderBy('category'))),
    getDocs(query(col(orgId, 'agric_usage'), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'desc'))),
    getDocs(query(col(orgId, 'agric_packing'), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'desc'))),
    getDocs(query(col(orgId, 'agric_shipping'), where('dispatchDate', '>=', startDate), where('dispatchDate', '<=', endDate), orderBy('dispatchDate', 'desc'))),
    getDocs(query(col(orgId, 'agric_equipment'), where('checkoutTime', '>=', startDate), orderBy('checkoutTime', 'desc'), limit(200))),
  ]);
  return {
    inventory: invSnap.docs.map(d => ({ ...d.data(), id: d.id } as AgricInventoryItem)),
    usageLogs: usageSnap.docs.map(d => ({ ...d.data(), id: d.id } as UsageLog)),
    packingRecords: packingSnap.docs.map(d => ({ ...d.data(), id: d.id } as PackingRecord)),
    shippingRecords: shippingSnap.docs.map(d => ({ ...d.data(), id: d.id } as ShippingRecord)),
    equipmentLog: equipSnap.docs.map(d => ({ ...d.data(), id: d.id } as EquipmentCheckout)),
  };
}
