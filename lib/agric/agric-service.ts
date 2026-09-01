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
  runTransaction, writeBatch, increment, limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  AgricInventoryItem, UsageLog, StockRequest, EquipmentCheckout,
  SprayPlan, PackingRecord, ShippingRecord, StockAdjustment,
  AgricAlert, RequestIssue, RequestReturnCondition,
} from './types';
import { convertItemQuantity } from './units';
import { planRequestDispatch, planRequestIssueReturn, planRequestReceipt } from './request-fulfillment';
import { getFarmWeek } from './week';

// -------------------------------------------------------------
// Collection helpers
// -------------------------------------------------------------

const col = (orgId: string, name: string) =>
  collection(db, `organizations/${orgId}/${name}`);

const ref = (orgId: string, name: string, id: string) =>
  doc(db, `organizations/${orgId}/${name}/${id}`);

type Unsub = () => void;

// Strip undefined values recursively because Firestore also rejects them inside arrays.
function clean<T extends object>(obj: T): Partial<T> {
  const cleanValue = (value: unknown): unknown => {
    if (value === undefined) return undefined;
    if (Array.isArray(value)) return value.map(cleanValue).filter(item => item !== undefined);
    if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(
        Object.entries(value).flatMap(([key, nested]) => {
          const cleaned = cleanValue(nested);
          return cleaned === undefined ? [] : [[key, cleaned]];
        }),
      );
    }
    return value;
  };
  return cleanValue(obj) as Partial<T>;
}

// -------------------------------------------------------------
// INVENTORY
// -------------------------------------------------------------

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

// -------------------------------------------------------------
// USAGE LOGS
// -------------------------------------------------------------

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
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Usage logging requires a connection so available stock can be verified safely.');
  }
  // Also decrement inventory stock atomically
  await runTransaction(db, async tx => {
    const invRef = ref(orgId, 'agric_inventory', log.itemId);
    const invSnap = await tx.get(invRef);
    if (invSnap.exists()) {
      const current = (invSnap.data().currentStock as number) ?? 0;
      const stockUom = invSnap.data().uom;
      const quantityInStockUom = convertItemQuantity(log.quantity, log.uom, stockUom, invSnap.data().packSize);
      if (current - quantityInStockUom < 0) throw new Error(`Insufficient stock: ${current} ${stockUom} available`);
      tx.update(invRef, {
        currentStock: increment(-quantityInStockUom),
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

// -------------------------------------------------------------
// STOCK REQUESTS
// -------------------------------------------------------------

export function subscribeRequests(
  orgId: string,
  includeDrafts: boolean,
  onData: (reqs: StockRequest[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  const q = includeDrafts
    ? query(col(orgId, 'agric_requests'), orderBy('requestDate', 'desc'), limit(200))
    : query(col(orgId, 'agric_requests'), where('status', 'in', ['pending', 'approved', 'partially_fulfilled', 'dispatched', 'received', 'rejected']), limit(200));
  return onSnapshot(q,
    snap => onData(snap.docs
      .map(d => ({ ...d.data(), id: d.id } as StockRequest))
      .sort((a, b) => b.requestDate.localeCompare(a.requestDate))),
    err => { console.error('[agric] requests:', err); onErr?.(err); },
  );
}

export async function createStockRequest(
  orgId: string,
  req: Omit<StockRequest, 'id'>,
): Promise<string> {
  const year = new Date().getFullYear();
  const requestRef = doc(col(orgId, 'agric_requests'));
  const requestNumber = `REQ-${year}-${requestRef.id.slice(0, 6).toUpperCase()}`;
  const status = req.status === 'draft' || req.status === 'approved' ? req.status : 'pending';
  await setDoc(requestRef, {
    ...clean(req),
    requestNumber,
    status,
    requestDate: new Date().toISOString(),
    createdAt: serverTimestamp(),
  });
  // The request is authoritative; an alert delivery failure must not make users retry it.
  if (status !== 'draft') void addAgricAlert(orgId, {
    type: 'restock_request',
    severity: req.priority === 'urgent' ? 'critical' : 'info',
    title: `New ${req.priority === 'urgent' ? 'URGENT ' : ''}Request: ${requestNumber}`,
    message: `${req.requestedByName} requested ${req.items.length} item(s) for ${req.farmZone} zone.`,
    createdAt: new Date().toISOString(),
    isRead: false,
    isActionRequired: true,
  }).catch(error => console.warn('[agric] request alert:', error));
  return requestRef.id;
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

/** Dispatch available quantities and keep any shortfall open for later fulfillment. */
export async function dispatchRequest(
  orgId: string,
  reqId: string,
  dispatchedBy: string,
  dispatchedItems: Array<{ itemId: string; qty: number }>,
  options: {
    issueDate: string;
    issuedToName?: string;
    expectedReturnDate?: string;
    notes?: string;
    recordConsumablesAsUsed?: boolean;
    weekStartsOn?: number;
  },
): Promise<void> {
  await runTransaction(db, async tx => {
    const reqRef = ref(orgId, 'agric_requests', reqId);
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists()) throw new Error('This request no longer exists.');
    const request = reqSnap.data() as StockRequest;
    if (!['approved', 'partially_fulfilled'].includes(request.status)) {
      throw new Error('Only approved or partially fulfilled requests can be dispatched.');
    }

    const dispatchPlan = planRequestDispatch(request.items, dispatchedItems);

    const inventorySnapshots = new Map<string, { document: ReturnType<typeof ref>; stock: number }>();
    for (const dispatch of dispatchPlan.dispatches) {
      const itemId = dispatch.itemId;
      const inventoryRef = ref(orgId, 'agric_inventory', itemId);
      const snapshot = await tx.get(inventoryRef);
      if (!snapshot.exists()) throw new Error('One of the requested stock items no longer exists.');
      inventorySnapshots.set(itemId, { document: inventoryRef, stock: Number(snapshot.data().currentStock ?? 0) });
    }

    for (const dispatch of dispatchPlan.dispatches) {
      const inventory = inventorySnapshots.get(dispatch.itemId)!;
      const requestItem = request.items.find(item => item.itemId === dispatch.itemId);
      if (dispatch.quantity > inventory.stock + 0.000001) throw new Error(`${requestItem?.itemName}: only ${inventory.stock} ${requestItem?.uom ?? 'units'} are available.`);
      tx.update(inventory.document, {
        currentStock: increment(-dispatch.quantity),
        lastUpdated: new Date().toISOString().slice(0, 10),
        updatedAt: serverTimestamp(),
      });
    }

    const recordedAt = new Date().toISOString();
    const newIssues: RequestIssue[] = [];
    const dispatchEvents: Array<{ itemId: string; quantity: number; uom: RequestIssue['uom']; issueId: string }> = [];
    for (const dispatch of dispatchPlan.dispatches) {
      const requestItem = request.items.find(item => item.itemId === dispatch.itemId)!;
      const mode = requestItem.mode ?? (requestItem.category === 'equipment' ? 'returnable' : 'consumable');
      const issueId = doc(col(orgId, 'agric_usage')).id;
      const recordAsUsed = mode === 'consumable' && options.recordConsumablesAsUsed === true;
      const issue: RequestIssue = {
        id: issueId,
        itemId: requestItem.itemId,
        itemName: requestItem.itemName,
        category: requestItem.category,
        quantity: dispatch.quantity,
        uom: requestItem.uom,
        mode,
        issueDate: options.issueDate,
        issuedAt: recordedAt,
        issuedBy: dispatchedBy,
        issuedToName: options.issuedToName?.trim() || request.requestedByName,
        expectedReturnDate: mode === 'returnable' ? options.expectedReturnDate : undefined,
        notes: options.notes?.trim() || undefined,
        usageStatus: mode === 'consumable' ? (recordAsUsed ? 'used' : 'pending') : 'not_applicable',
        usedDate: recordAsUsed ? options.issueDate : undefined,
        usedAt: recordAsUsed ? recordedAt : undefined,
        usedBy: recordAsUsed ? dispatchedBy : undefined,
        returnStatus: mode === 'returnable' ? 'out' : 'not_applicable',
      };
      newIssues.push(issue);
      dispatchEvents.push({ itemId: dispatch.itemId, quantity: dispatch.quantity, uom: dispatch.uom, issueId });

      if (recordAsUsed) {
        const farmWeek = getFarmWeek(options.issueDate, options.weekStartsOn ?? 0);
        tx.set(ref(orgId, 'agric_usage', issueId), {
          itemId: issue.itemId,
          itemName: issue.itemName,
          category: issue.category,
          date: options.issueDate,
          quantity: issue.quantity,
          uom: issue.uom,
          farmZone: request.farmZone,
          appliedBy: issue.issuedToName,
          supervisorId: dispatchedBy,
          notes: options.notes?.trim() || `Issued through ${request.requestNumber}`,
          weekNumber: farmWeek.week,
          weekYear: farmWeek.year,
          weekStartDate: farmWeek.startDate,
          weekEndDate: farmWeek.endDate,
          sourceType: 'stock_request',
          sourceRequestId: reqId,
          sourceRequestNumber: request.requestNumber,
          sourceIssueId: issueId,
          recordedBy: dispatchedBy,
          createdAt: serverTimestamp(),
        });
      }
    }
    tx.update(reqRef, {
      items: clean(dispatchPlan.items),
      status: dispatchPlan.fullyDispatched ? 'dispatched' : 'partially_fulfilled',
      dispatchedBy,
      dispatchedAt: request.dispatchedAt ?? recordedAt,
      lastDispatchedAt: recordedAt,
      issueHistory: [...(request.issueHistory ?? []), ...newIssues].map(issue => clean(issue)),
      fulfillmentHistory: [
        ...(request.fulfillmentHistory ?? []),
        {
          type: 'dispatch', recordedAt, recordedBy: dispatchedBy,
          items: dispatchEvents,
        },
        ...(newIssues.some(issue => issue.usageStatus === 'used') ? [{
          type: 'usage' as const,
          recordedAt,
          recordedBy: dispatchedBy,
          items: newIssues.filter(issue => issue.usageStatus === 'used').map(issue => ({ itemId: issue.itemId, quantity: issue.quantity, uom: issue.uom, issueId: issue.id })),
        }] : []),
      ],
      updatedAt: serverTimestamp(),
    });
  });
}

export async function recordRequestIssueUsage(
  orgId: string,
  reqId: string,
  issueId: string,
  usedBy: string,
  usedDate: string,
  weekStartsOn = 0,
): Promise<void> {
  await runTransaction(db, async tx => {
    const reqRef = ref(orgId, 'agric_requests', reqId);
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists()) throw new Error('This request no longer exists.');
    const request = reqSnap.data() as StockRequest;
    const issue = (request.issueHistory ?? []).find(item => item.id === issueId);
    if (!issue) throw new Error('This issue record no longer exists.');
    if (issue.mode !== 'consumable') throw new Error('Returnable items cannot be logged as consumed.');
    if (issue.usageStatus === 'used') throw new Error('This issue has already been logged as used.');

    const recordedAt = new Date().toISOString();
    const farmWeek = getFarmWeek(usedDate, weekStartsOn);
    const updatedIssues = (request.issueHistory ?? []).map(item => item.id === issueId ? {
      ...item, usageStatus: 'used' as const, usedDate, usedAt: recordedAt, usedBy,
    } : item);
    tx.set(ref(orgId, 'agric_usage', issueId), {
      itemId: issue.itemId,
      itemName: issue.itemName,
      category: issue.category,
      date: usedDate,
      quantity: issue.quantity,
      uom: issue.uom,
      farmZone: request.farmZone,
      appliedBy: issue.issuedToName,
      supervisorId: usedBy,
      notes: issue.notes || `Issued through ${request.requestNumber}`,
      weekNumber: farmWeek.week,
      weekYear: farmWeek.year,
      weekStartDate: farmWeek.startDate,
      weekEndDate: farmWeek.endDate,
      sourceType: 'stock_request',
      sourceRequestId: reqId,
      sourceRequestNumber: request.requestNumber,
      sourceIssueId: issueId,
      recordedBy: usedBy,
      createdAt: serverTimestamp(),
    });
    tx.update(reqRef, {
      issueHistory: clean(updatedIssues),
      fulfillmentHistory: [
        ...(request.fulfillmentHistory ?? []),
        { type: 'usage', recordedAt, recordedBy: usedBy, items: [{ itemId: issue.itemId, quantity: issue.quantity, uom: issue.uom, issueId }] },
      ],
      updatedAt: serverTimestamp(),
    });
  });
}

export async function returnRequestIssue(
  orgId: string,
  reqId: string,
  issueId: string,
  quantity: number,
  condition: RequestReturnCondition,
  returnedBy: string,
  notes?: string,
): Promise<void> {
  await runTransaction(db, async tx => {
    const reqRef = ref(orgId, 'agric_requests', reqId);
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists()) throw new Error('This request no longer exists.');
    const request = reqSnap.data() as StockRequest;
    const issue = (request.issueHistory ?? []).find(item => item.id === issueId);
    if (!issue) throw new Error('This issue record no longer exists.');
    const inventoryRef = ref(orgId, 'agric_inventory', issue.itemId);
    const inventorySnap = await tx.get(inventoryRef);
    if (!inventorySnap.exists()) throw new Error('The linked inventory item no longer exists.');

    const recordedAt = new Date().toISOString();
    const plan = planRequestIssueReturn(request.issueHistory ?? [], issueId, quantity, condition, returnedBy, recordedAt, notes);
    if (plan.restoreQuantity > 0) {
      tx.update(inventoryRef, {
        currentStock: increment(plan.restoreQuantity),
        lastUpdated: recordedAt.slice(0, 10),
        updatedAt: serverTimestamp(),
      });
    }
    tx.update(reqRef, {
      issueHistory: clean(plan.issues),
      fulfillmentHistory: [
        ...(request.fulfillmentHistory ?? []),
        { type: 'return', recordedAt, recordedBy: returnedBy, items: [{ itemId: issue.itemId, quantity, uom: issue.uom, issueId, condition }] },
      ],
      updatedAt: serverTimestamp(),
    });
  });
}

export async function confirmRequestReceipt(orgId: string, reqId: string, receivedBy: string): Promise<void> {
  await runTransaction(db, async tx => {
    const reqRef = ref(orgId, 'agric_requests', reqId);
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists()) throw new Error('This request no longer exists.');
    const request = reqSnap.data() as StockRequest;
    if (!['partially_fulfilled', 'dispatched'].includes(request.status)) {
      throw new Error('There are no dispatched quantities awaiting receipt.');
    }

    const receiptPlan = planRequestReceipt(request.items);
    const recordedAt = new Date().toISOString();
    tx.update(reqRef, {
      items: clean(receiptPlan.items),
      status: receiptPlan.fullyReceived ? 'received' : 'partially_fulfilled',
      receivedBy,
      receivedAt: receiptPlan.fullyReceived ? recordedAt : request.receivedAt ?? null,
      fulfillmentHistory: [
        ...(request.fulfillmentHistory ?? []),
        { type: 'receipt', recordedAt, recordedBy: receivedBy, items: receiptPlan.receipts },
      ],
      updatedAt: serverTimestamp(),
    });
  });
}

// -------------------------------------------------------------
// EQUIPMENT CHECKOUTS
// -------------------------------------------------------------

export function subscribeEquipment(
  orgId: string,
  onData: (checkouts: EquipmentCheckout[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  // Include open checkouts and recent return history. Restricting this to today
  // caused equipment already issued before midnight to disappear from tracking.
  const q = query(col(orgId, 'agric_equipment'), orderBy('checkoutTime', 'desc'), limit(500));
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

// -------------------------------------------------------------
// SPRAY PLANS
// -------------------------------------------------------------

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
  orgId: string, planId: string, appliedAt: string, recordedBy: string, notes?: string,
): Promise<void> {
  await runTransaction(db, async tx => {
    const planRef = ref(orgId, 'agric_plans', planId);
    const planSnap = await tx.get(planRef);
    if (!planSnap.exists()) throw new Error('This spray plan no longer exists.');

    const plan = planSnap.data();
    const completed = Number(plan.completedApplications ?? 0);
    const total = Number(plan.totalApplications ?? 0);
    if (plan.status !== 'active') throw new Error('Only active spray plans can be updated.');
    if (!Number.isFinite(total) || total < 1 || completed >= total) {
      throw new Error('All planned applications have already been recorded.');
    }

    const nextCompleted = completed + 1;
    tx.update(planRef, {
      completedApplications: nextCompleted,
      applicationHistory: [
        ...(Array.isArray(plan.applicationHistory) ? plan.applicationHistory : []),
        { appliedAt, recordedAt: new Date().toISOString(), recordedBy, ...(notes?.trim() ? { notes: notes.trim() } : {}) },
      ],
      status: nextCompleted >= total ? 'completed' : 'active',
      updatedAt: serverTimestamp(),
    });
  });
}

// -------------------------------------------------------------
// PACKING STATION
// -------------------------------------------------------------

export function subscribePackingToday(
  orgId: string,
  onData: (records: PackingRecord[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  // Packhouse stock is cumulative. Loading only today's records made stock from
  // previous days vanish while shipments still reduced the displayed balance.
  const q = query(col(orgId, 'agric_packing'), orderBy('date', 'desc'), limit(1000));
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

// -------------------------------------------------------------
// SHIPPING
// -------------------------------------------------------------

export function subscribeShipping(
  orgId: string,
  onData: (records: ShippingRecord[]) => void,
  onErr?: (e: Error) => void,
): Unsub {
  // Keep the same history window as packing so stock is not overstated merely
  // because older dispatches disappeared from the client-side balance.
  const q = query(col(orgId, 'agric_shipping'), orderBy('dispatchDate', 'desc'), limit(1000));
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

// -------------------------------------------------------------
// ALERTS
// -------------------------------------------------------------

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

// -------------------------------------------------------------
// LOW-STOCK CHECKER (call on app load and after each usage log)
// -------------------------------------------------------------

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

// -------------------------------------------------------------
// REPORTS — fetch snapshots for report generation
// -------------------------------------------------------------

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

