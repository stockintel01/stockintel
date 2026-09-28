'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import type {
  AgricAlert,
  AgricInventoryItem,
  EquipmentCheckout,
  FarmZone,
  RequestReturnCondition,
  RequestFulfillmentEvent,
  SprayPlan,
  StockAdjustment,
  StockRequest,
  UOM,
  UsageLog,
} from './types';
import { loadSupabasePackingRecords, loadSupabaseShippingRecords } from './supabase-packhouse-record-service';

type Row = Record<string, any>;
type Unsub = () => void;

const client = () => getBrowserSupabaseClient() as unknown as SupabaseClient;
const asObject = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};

function check(error: { message?: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message ?? 'operation failed'}`);
}

function uomCode(value: string): UOM {
  const normalized = value.toLowerCase();
  if (normalized === 'l' || normalized === 'lt' || normalized === 'litre' || normalized === 'liter') return 'L';
  if (normalized === 'unit' || normalized === 'units') return 'units';
  if (normalized === 'box' || normalized === 'boxes') return 'boxes';
  if (normalized === 'bag' || normalized === 'bags') return 'bags';
  return value as UOM;
}

function databaseUnitCode(value: UOM | string) {
  const normalized = String(value).toLowerCase();
  if (normalized === 'lt' || normalized === 'l') return 'L';
  if (normalized === 'units' || normalized === 'unit') return 'unit';
  if (normalized === 'boxes' || normalized === 'box') return 'box';
  if (normalized === 'bags' || normalized === 'bag') return 'bag';
  return String(value);
}

async function paged(table: string, organizationId: string, order?: { column: string; ascending?: boolean }) {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let query = client().from(table).select('*').eq('organization_id', organizationId);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
    const { data, error } = await query.range(from, from + 999);
    check(error, `Unable to load ${table}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

async function units(organizationId: string) {
  const { data, error } = await client().from('units_of_measure').select('*')
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .eq('active', true)
    .range(0, 999);
  check(error, 'Unable to load units of measure');
  return data ?? [];
}

async function unitId(organizationId: string, code: UOM | string) {
  const expected = databaseUnitCode(code).toLowerCase();
  const match = (await units(organizationId)).find(row => String(row.code).toLowerCase() === expected);
  if (!match) throw new Error(`The unit ${code} is not configured for this workspace.`);
  return String(match.id);
}

async function zoneId(organizationId: string, name?: string) {
  if (!name) return null;
  const { data, error } = await client().from('farm_zones').select('id')
    .eq('organization_id', organizationId).ilike('name', name.trim()).limit(1).maybeSingle();
  check(error, 'Unable to resolve the farm zone');
  return data?.id ?? null;
}

function subscribe<T>(input: {
  organizationId: string;
  tables: string[];
  load: () => Promise<T>;
  onData: (data: T) => void;
  onError?: (error: Error) => void;
}): Unsub {
  const db = client();
  let active = true;
  let loading = false;
  let rerun = false;
  const refresh = async () => {
    if (!active) return;
    if (loading) { rerun = true; return; }
    loading = true;
    try {
      const data = await input.load();
      if (active) input.onData(data);
    } catch (error) {
      if (active) input.onError?.(error instanceof Error ? error : new Error('Unable to refresh farm data'));
    } finally {
      loading = false;
      if (rerun) { rerun = false; void refresh(); }
    }
  };
  let channel = db.channel(`agric:${input.tables.join('-')}:${input.organizationId}:${crypto.randomUUID()}`);
  for (const table of input.tables) {
    channel = channel.on('postgres_changes', {
      event: '*', schema: 'public', table, filter: `organization_id=eq.${input.organizationId}`,
    }, () => void refresh());
  }
  channel.subscribe((status: string) => { if (status === 'SUBSCRIBED') void refresh(); });
  void refresh();
  return () => { active = false; void db.removeChannel(channel); };
}

async function loadInventory(organizationId: string): Promise<AgricInventoryItem[]> {
  const [items, balances, unitRows] = await Promise.all([
    paged('inventory_items', organizationId, { column: 'name' }),
    paged('inventory_balances', organizationId),
    units(organizationId),
  ]);
  const balanceByItem = new Map(balances.map(row => [String(row.item_id), Number(row.quantity)]));
  const unitById = new Map(unitRows.map(row => [String(row.id), row]));
  return items.filter(row => row.active && !row.archived_at).map(row => ({
    id: String(row.id),
    name: String(row.name),
    chemicalComponent: row.chemical_component ?? undefined,
    category: row.category,
    uom: uomCode(String(unitById.get(String(row.stock_unit_id))?.code ?? 'units')),
    packSize: row.pack_description ?? undefined,
    currentStock: balanceByItem.get(String(row.id)) ?? 0,
    minimumStock: Number(row.minimum_stock),
    reorderAlertDays: Number(row.reorder_alert_days),
    supplierName: row.supplier_name ?? undefined,
    unitCost: row.unit_cost == null ? undefined : Number(row.unit_cost),
    location: row.storage_location ?? undefined,
    lastUpdated: String(row.updated_at).slice(0, 10),
    createdBy: String(row.created_by),
    isActive: Boolean(row.active),
    avgWeeklyUsage: row.average_weekly_usage == null ? undefined : Number(row.average_weekly_usage),
    lastReceivedDate: row.last_received_on ?? undefined,
    lastReceivedQty: row.last_received_quantity == null ? undefined : Number(row.last_received_quantity),
  }));
}

export const subscribeSupabaseInventory = (organizationId: string, onData: (items: AgricInventoryItem[]) => void, onError?: (error: Error) => void) => subscribe({
  organizationId, tables: ['inventory_items', 'inventory_balances'], load: () => loadInventory(organizationId), onData, onError,
});

export async function addSupabaseInventoryItem(organizationId: string, item: Omit<AgricInventoryItem, 'id'>) {
  const { data, error } = await client().rpc('create_inventory_item', {
    p_organization_id: organizationId,
    p_name: item.name,
    p_category: item.category,
    p_stock_unit_id: await unitId(organizationId, item.uom),
    p_initial_quantity: item.currentStock,
    p_chemical_component: item.chemicalComponent ?? null,
    p_pack_description: item.packSize ?? null,
    p_minimum_stock: item.minimumStock,
    p_reorder_alert_days: item.reorderAlertDays,
    p_supplier_name: item.supplierName ?? null,
    p_unit_cost: item.unitCost ?? null,
    p_storage_location: item.location ?? null,
    p_average_weekly_usage: item.avgWeeklyUsage ?? null,
    p_received_on: item.lastReceivedDate ?? new Date().toISOString().slice(0, 10),
    p_idempotency_key: crypto.randomUUID(),
  });
  check(error, 'Unable to create the inventory item');
  return String(data);
}

export async function seedSupabaseInventory(organizationId: string, items: Omit<AgricInventoryItem, 'id'>[]) {
  if ((await loadInventory(organizationId)).length > 0) return;
  for (const item of items) await addSupabaseInventoryItem(organizationId, item);
}

export async function updateSupabaseInventoryItem(organizationId: string, itemId: string, fields: Partial<AgricInventoryItem>) {
  const payload: Row = {};
  if (fields.name !== undefined) payload.name = fields.name;
  if (fields.chemicalComponent !== undefined) payload.chemical_component = fields.chemicalComponent || null;
  if (fields.category !== undefined) payload.category = fields.category;
  if (fields.uom !== undefined) payload.stock_unit_id = await unitId(organizationId, fields.uom);
  if (fields.packSize !== undefined) payload.pack_description = fields.packSize || null;
  if (fields.minimumStock !== undefined) payload.minimum_stock = fields.minimumStock;
  if (fields.reorderAlertDays !== undefined) payload.reorder_alert_days = fields.reorderAlertDays;
  if (fields.supplierName !== undefined) payload.supplier_name = fields.supplierName || null;
  if (fields.unitCost !== undefined) payload.unit_cost = fields.unitCost ?? null;
  if (fields.location !== undefined) payload.storage_location = fields.location || null;
  if (fields.avgWeeklyUsage !== undefined) payload.average_weekly_usage = fields.avgWeeklyUsage ?? null;
  const { error } = await client().from('inventory_items').update(payload).eq('organization_id', organizationId).eq('id', itemId);
  check(error, 'Unable to update the inventory item');
}

export async function archiveSupabaseInventoryItem(organizationId: string, itemId: string, note: string) {
  const { data, error: readError } = await client().from('inventory_items').select('id').eq('organization_id', organizationId).eq('id', itemId).maybeSingle();
  check(readError, 'Unable to verify the inventory item');
  if (!data) throw new Error('Inventory item not found');
  const { error } = await client().rpc('archive_inventory_item', { p_item_id: itemId, p_reason: note });
  check(error, 'Unable to archive the inventory item');
}

export async function submitSupabaseStockAdjustment(organizationId: string, adjustment: Omit<StockAdjustment, 'id'>) {
  const { data, error } = await client().from('stock_adjustments').insert({
    organization_id: organizationId,
    item_id: adjustment.itemId,
    requested_quantity: adjustment.newQuantity,
    expected_quantity: adjustment.oldQuantity,
    reason: adjustment.reason,
    notes: adjustment.note || null,
    status: 'pending_approval',
    requested_by: adjustment.adjustedBy,
  }).select('id').single();
  check(error, 'Unable to submit the stock adjustment');
  return String(data?.id);
}

export async function approveSupabaseStockAdjustment(adjustmentId: string, note: string) {
  const { error } = await client().rpc('approve_stock_adjustment', {
    p_adjustment_id: adjustmentId, p_review_notes: note || null, p_idempotency_key: crypto.randomUUID(),
  });
  check(error, 'Unable to approve the stock adjustment');
}

async function loadUsage(organizationId: string): Promise<UsageLog[]> {
  const [logs, inventory, zones, unitRows, requests] = await Promise.all([
    paged('usage_logs', organizationId, { column: 'applied_at', ascending: false }),
    paged('inventory_items', organizationId),
    paged('farm_zones', organizationId),
    units(organizationId),
    paged('stock_requests', organizationId),
  ]);
  const itemById = new Map(inventory.map(row => [String(row.id), row]));
  const zoneById = new Map(zones.map(row => [String(row.id), row]));
  const unitById = new Map(unitRows.map(row => [String(row.id), row]));
  const requestById = new Map(requests.map(row => [String(row.id), row]));
  return logs.map(row => {
    const item = itemById.get(String(row.item_id));
    const request = requestById.get(String(row.source_request_id));
    return {
      id: String(row.id), itemId: String(row.item_id), itemName: String(item?.name ?? 'Inventory item'),
      category: item?.category ?? 'other', date: String(row.applied_at).slice(0, 10), quantity: Number(row.quantity),
      uom: uomCode(String(unitById.get(String(row.unit_id))?.code ?? 'units')),
      farmZone: String(zoneById.get(String(row.farm_zone_id))?.name ?? 'Unassigned') as FarmZone,
      appliedBy: String(row.applied_by_name), supervisorId: row.supervisor_id ?? undefined,
      batchNumber: row.batch_number ?? undefined, notes: row.notes ?? undefined,
      weekNumber: row.farm_week ?? undefined, weekYear: row.farm_week_year ?? undefined,
      weekStartDate: row.week_start_date ?? undefined, weekEndDate: row.week_end_date ?? undefined,
      sourceType: row.issue_id ? 'stock_request' : 'manual', sourceRequestId: request?.id ?? undefined,
      sourceRequestNumber: request?.request_number ?? undefined, sourceIssueId: row.issue_id ?? undefined,
      recordedBy: row.recorded_by ?? undefined,
    } satisfies UsageLog;
  });
}

export const subscribeSupabaseUsage = (organizationId: string, onData: (logs: UsageLog[]) => void, onError?: (error: Error) => void) => subscribe({
  organizationId, tables: ['usage_logs', 'inventory_items', 'farm_zones'], load: () => loadUsage(organizationId), onData, onError,
});

export async function addSupabaseUsage(organizationId: string, log: Omit<UsageLog, 'id'>) {
  const { error } = await client().rpc('record_direct_inventory_usage', {
    p_organization_id: organizationId, p_item_id: log.itemId, p_quantity: log.quantity,
    p_unit_id: await unitId(organizationId, log.uom), p_applied_at: `${log.date}T12:00:00.000Z`,
    p_farm_zone_id: await zoneId(organizationId, log.farmZone), p_applied_by_name: log.appliedBy,
    p_batch_number: log.batchNumber ?? null, p_notes: log.notes ?? null, p_idempotency_key: crypto.randomUUID(),
  });
  check(error, 'Unable to record inventory usage');
}

function requestStatus(value: string): StockRequest['status'] {
  if (value === 'cancelled') return 'rejected';
  if (value === 'closed') return 'received';
  return value as StockRequest['status'];
}

async function loadRequests(organizationId: string, includeDrafts = true): Promise<StockRequest[]> {
  const [requests, requestItems, inventory, unitRows, issues, returns, usage, events] = await Promise.all([
    paged('stock_requests', organizationId, { column: 'requested_at', ascending: false }),
    paged('stock_request_items', organizationId),
    paged('inventory_items', organizationId),
    units(organizationId),
    paged('stock_issues', organizationId),
    paged('stock_issue_returns', organizationId),
    paged('usage_logs', organizationId),
    paged('stock_request_events', organizationId, { column: 'occurred_at' }),
  ]);
  const itemById = new Map(inventory.map(row => [String(row.id), row]));
  const unitById = new Map(unitRows.map(row => [String(row.id), row]));
  const issuesByRequest = new Map<string, Row[]>();
  for (const issue of issues) {
    const key = String(issue.request_id);
    issuesByRequest.set(key, [...(issuesByRequest.get(key) ?? []), issue]);
  }

  return requests.filter(row => includeDrafts || row.status !== 'draft').map(row => {
    const linkedItems = requestItems.filter(item => item.request_id === row.id);
    const linkedIssues = issuesByRequest.get(String(row.id)) ?? [];
    const mappedItems = linkedItems.map(requestItem => {
      const item = itemById.get(String(requestItem.item_id));
      const requestUnit = unitById.get(String(requestItem.requested_unit_id));
      const stockUnit = unitById.get(String(item?.stock_unit_id));
      const itemIssues = linkedIssues.filter(issue => issue.request_item_id === requestItem.id);
      const issuedInStockUnit = itemIssues.reduce((sum, issue) => sum + Number(issue.quantity), 0);
      const receivedInStockUnit = itemIssues.filter(issue => issue.received_at).reduce((sum, issue) => sum + Number(issue.quantity), 0);
      return {
        itemId: String(requestItem.item_id), itemName: String(item?.name ?? 'Inventory item'), category: item?.category ?? 'other',
        requestedQty: Number(requestItem.requested_quantity), requestedUom: uomCode(String(requestUnit?.code ?? 'units')),
        requestedQtyInStockUom: Number(requestItem.requested_quantity_in_stock_unit),
        dispatchedQty: issuedInStockUnit, receivedQty: receivedInStockUnit,
        uom: uomCode(String(stockUnit?.code ?? 'units')), mode: requestItem.mode, note: requestItem.notes ?? undefined,
      };
    });
    const mappedIssues = linkedIssues.map(issue => {
      const item = itemById.get(String(issue.item_id));
      const stockUnit = unitById.get(String(issue.stock_unit_id));
      const issueReturns = returns.filter(entry => entry.issue_id === issue.id);
      const usedQuantity = usage.filter(entry => entry.issue_id === issue.id).reduce((sum, entry) => sum + Number(entry.quantity_in_stock_unit), 0);
      const resolved = Number(issue.returned_quantity) + Number(issue.damaged_quantity) + Number(issue.lost_quantity);
      return {
        id: String(issue.id), itemId: String(issue.item_id), itemName: String(item?.name ?? 'Inventory item'),
        category: item?.category ?? 'other', quantity: Number(issue.quantity), uom: uomCode(String(stockUnit?.code ?? 'units')),
        mode: issue.mode, issueDate: String(issue.issued_at).slice(0, 10), issuedAt: issue.issued_at,
        issuedBy: String(issue.issued_by), issuedToName: String(issue.issued_to_name),
        expectedReturnDate: issue.expected_return_at ? String(issue.expected_return_at).slice(0, 10) : undefined,
        notes: issue.notes ?? undefined, usageStatus: issue.mode === 'consumable' ? (usedQuantity >= Number(issue.quantity) ? 'used' : 'pending') : 'not_applicable',
        usedDate: issue.usage_recorded_at ? String(issue.usage_recorded_at).slice(0, 10) : undefined,
        usedAt: issue.usage_recorded_at ?? undefined, usedBy: issue.usage_recorded_by ?? undefined,
        returnedQty: Number(issue.returned_quantity), damagedQty: Number(issue.damaged_quantity), lostQty: Number(issue.lost_quantity),
        returnStatus: issue.mode === 'consumable' ? 'not_applicable' : resolved <= 0 ? 'out' : resolved >= Number(issue.quantity) ? 'resolved' : 'partially_resolved',
        returnEvents: issueReturns.map(entry => ({
          quantity: Number(entry.quantity), condition: entry.condition, returnedAt: entry.returned_at,
          returnedBy: String(entry.returned_by), notes: entry.notes ?? undefined,
        })),
      } satisfies NonNullable<StockRequest['issueHistory']>[number];
    });
    const history = events.filter(event => event.request_id === row.id).flatMap(event => {
      const details = asObject(event.details);
      const type: RequestFulfillmentEvent['type'] | null = event.event_type === 'stock_issued' ? 'dispatch'
        : event.event_type === 'receipt_confirmed' ? 'receipt'
          : event.event_type === 'usage_recorded' ? 'usage'
            : event.event_type === 'stock_returned' ? 'return' : null;
      if (!type) return [];
      const issue = linkedIssues.find(entry => entry.id === details.issue_id);
      return [{
        type, recordedAt: event.occurred_at, recordedBy: String(event.actor_id ?? ''),
        items: issue ? [{
          itemId: String(issue.item_id), quantity: Number(details.quantity_in_stock_unit ?? issue.quantity),
          uom: uomCode(String(unitById.get(String(issue.stock_unit_id))?.code ?? 'units')),
          issueId: String(issue.id), condition: details.condition as RequestReturnCondition | undefined,
        }] : [],
      }];
    });
    return {
      id: String(row.id), requestNumber: String(row.request_number), requestedBy: String(row.requested_by),
      requestedByName: String(row.requested_by_name), requestedByRole: 'worker', requestDate: String(row.requested_at),
      requiredByDate: row.required_by_date ?? undefined, farmZone: String(row.farm_zone_name ?? 'Unassigned') as FarmZone,
      items: mappedItems, status: requestStatus(row.status), priority: row.priority, note: row.notes ?? undefined,
      approvedBy: row.approved_by ?? undefined, approvedAt: row.approved_at ?? undefined,
      dispatchedBy: linkedIssues[0]?.issued_by ?? undefined, dispatchedAt: linkedIssues[0]?.issued_at ?? undefined,
      lastDispatchedAt: linkedIssues.at(-1)?.issued_at ?? undefined,
      receivedBy: linkedIssues.find(issue => issue.received_by)?.received_by ?? undefined,
      receivedAt: linkedIssues.find(issue => issue.received_at)?.received_at ?? undefined,
      rejectionReason: row.rejection_reason ?? undefined, fulfillmentHistory: history,
      issueHistory: mappedIssues,
    } satisfies StockRequest;
  });
}

export const subscribeSupabaseRequests = (organizationId: string, includeDrafts: boolean, onData: (requests: StockRequest[]) => void, onError?: (error: Error) => void) => subscribe({
  organizationId,
  tables: ['stock_requests', 'stock_request_items', 'stock_issues', 'stock_issue_returns', 'stock_request_events', 'usage_logs', 'inventory_items'],
  load: () => loadRequests(organizationId, includeDrafts), onData, onError,
});

async function requestItemsPayload(organizationId: string, items: StockRequest['items']) {
  return Promise.all(items.map(async item => ({
    item_id: item.itemId,
    unit_id: await unitId(organizationId, item.requestedUom ?? item.uom),
    quantity: item.requestedQty,
    mode: item.mode ?? (item.category === 'equipment' ? 'returnable' : 'consumable'),
    notes: item.note ?? '',
  })));
}

export async function createSupabaseStockRequest(organizationId: string, request: Omit<StockRequest, 'id'>) {
  const action = request.status === 'draft' ? 'draft' : request.status === 'approved' ? 'submit_and_approve' : 'submit';
  const { data, error } = await client().rpc('create_stock_request', {
    p_organization_id: organizationId, p_items: await requestItemsPayload(organizationId, request.items),
    p_farm_zone_id: await zoneId(organizationId, request.farmZone), p_required_by_date: request.requiredByDate ?? null,
    p_priority: request.priority, p_notes: request.note ?? null, p_action: action, p_idempotency_key: crypto.randomUUID(),
  });
  check(error, 'Unable to create the stock request');
  return String(data);
}

export async function updateSupabaseStockRequest(organizationId: string, requestId: string, fields: Partial<StockRequest>) {
  if (fields.status === 'approved' || fields.status === 'rejected') {
    const { error } = await client().rpc('decide_stock_request', {
      p_request_id: requestId, p_decision: fields.status === 'approved' ? 'approve' : 'reject',
      p_reason: fields.rejectionReason ?? null, p_idempotency_key: crypto.randomUUID(),
    });
    return check(error, `Unable to ${fields.status === 'approved' ? 'approve' : 'reject'} the request`);
  }
  if (fields.status === 'pending') {
    const { error } = await client().rpc('submit_stock_request', {
      p_request_id: requestId, p_approve: false, p_idempotency_key: crypto.randomUUID(),
    });
    return check(error, 'Unable to submit the stock request');
  }
  const current = (await loadRequests(organizationId, true)).find(item => item.id === requestId);
  if (!current) throw new Error('Stock request not found');
  const merged = { ...current, ...fields };
  const { error } = await client().rpc('update_draft_stock_request', {
    p_request_id: requestId, p_items: await requestItemsPayload(organizationId, merged.items),
    p_farm_zone_id: await zoneId(organizationId, merged.farmZone), p_required_by_date: merged.requiredByDate ?? null,
    p_priority: merged.priority, p_notes: merged.note ?? null, p_idempotency_key: crypto.randomUUID(),
  });
  check(error, 'Unable to update the request draft');
}

export async function dispatchSupabaseRequest(
  organizationId: string,
  requestId: string,
  dispatchedItems: Array<{ itemId: string; qty: number }>,
  options: { issueDate: string; issuedToName?: string; expectedReturnDate?: string; notes?: string; recordConsumablesAsUsed?: boolean },
) {
  const [requestItems, inventory] = await Promise.all([paged('stock_request_items', organizationId), paged('inventory_items', organizationId)]);
  for (const dispatch of dispatchedItems.filter(item => item.qty > 0)) {
    const requestItem = requestItems.find(item => item.request_id === requestId && item.item_id === dispatch.itemId);
    const item = inventory.find(entry => entry.id === dispatch.itemId);
    if (!requestItem || !item) throw new Error('One of the requested items is no longer available.');
    const issueKey = crypto.randomUUID();
    const { data: issueId, error } = await client().rpc('dispatch_stock_request_item', {
      p_request_item_id: requestItem.id, p_quantity: dispatch.qty, p_unit_id: item.stock_unit_id,
      p_issued_to: null, p_issued_to_name: options.issuedToName ?? null,
      p_issued_at: `${options.issueDate}T12:00:00.000Z`,
      p_expected_return_at: requestItem.mode === 'returnable' && options.expectedReturnDate ? `${options.expectedReturnDate}T23:59:59.000Z` : null,
      p_notes: options.notes ?? null, p_idempotency_key: issueKey,
    });
    check(error, 'Unable to issue requested stock');
    if (requestItem.mode === 'consumable' && options.recordConsumablesAsUsed) {
      const usageResult = await client().rpc('record_stock_issue_usage', {
        p_issue_id: issueId, p_quantity: dispatch.qty, p_unit_id: item.stock_unit_id,
        p_applied_at: `${options.issueDate}T12:00:00.000Z`, p_farm_zone_id: null,
        p_applied_by_name: options.issuedToName ?? null, p_batch_number: null,
        p_notes: options.notes ?? null, p_idempotency_key: `usage-${issueKey}`,
      });
      check(usageResult.error, 'Stock was issued but usage could not be recorded');
    }
  }
}

export async function recordSupabaseIssueUsage(organizationId: string, issueId: string, usedDate: string) {
  const { data: issue, error: readError } = await client().from('stock_issues').select('quantity, stock_unit_id')
    .eq('organization_id', organizationId).eq('id', issueId).single();
  check(readError, 'Unable to load the stock issue');
  if (!issue) throw new Error('Stock issue not found');
  const { error } = await client().rpc('record_stock_issue_usage', {
    p_issue_id: issueId, p_quantity: issue.quantity, p_unit_id: issue.stock_unit_id,
    p_applied_at: `${usedDate}T12:00:00.000Z`, p_farm_zone_id: null, p_applied_by_name: null,
    p_batch_number: null, p_notes: null, p_idempotency_key: crypto.randomUUID(),
  });
  check(error, 'Unable to record issued stock as used');
}

export async function returnSupabaseIssue(organizationId: string, issueId: string, quantity: number, condition: RequestReturnCondition, notes?: string) {
  const { data: issue, error: readError } = await client().from('stock_issues').select('stock_unit_id')
    .eq('organization_id', organizationId).eq('id', issueId).single();
  check(readError, 'Unable to load the stock issue');
  if (!issue) throw new Error('Stock issue not found');
  const { error } = await client().rpc('return_stock_issue', {
    p_issue_id: issueId, p_quantity: quantity, p_unit_id: issue.stock_unit_id,
    p_condition: condition, p_returned_at: new Date().toISOString(), p_notes: notes ?? null,
    p_idempotency_key: crypto.randomUUID(),
  });
  check(error, 'Unable to record the stock return');
}

export async function confirmSupabaseRequestReceipt(organizationId: string, requestId: string) {
  const { data, error: readError } = await client().from('stock_requests').select('id').eq('organization_id', organizationId).eq('id', requestId).maybeSingle();
  check(readError, 'Unable to verify the stock request');
  if (!data) throw new Error('Stock request not found');
  const { error } = await client().rpc('confirm_stock_request_receipt', { p_request_id: requestId, p_idempotency_key: crypto.randomUUID() });
  check(error, 'Unable to confirm stock receipt');
}

async function loadEquipment(organizationId: string): Promise<EquipmentCheckout[]> {
  const [checkouts, assets, zones, directoryResult] = await Promise.all([
    paged('equipment_checkouts', organizationId, { column: 'checked_out_at', ascending: false }),
    paged('equipment_assets', organizationId),
    paged('farm_zones', organizationId),
    client().rpc('organization_member_directory', { p_organization_id: organizationId }),
  ]);
  check(directoryResult.error, 'Unable to load equipment supervisors');
  const names = new Map((Array.isArray(directoryResult.data) ? directoryResult.data as Row[] : []).map(row => [String(row.userId), String(row.displayName)]));
  const assetById = new Map(assets.map(row => [String(row.id), row]));
  const zoneById = new Map(zones.map(row => [String(row.id), row]));
  const now = Date.now();
  return checkouts.map(row => {
    const asset = assetById.get(String(row.asset_id));
    return {
      id: String(row.id), itemId: String(asset?.inventory_item_id ?? row.asset_id), itemName: String(asset?.name ?? 'Equipment'),
      checkoutBy: String(row.checked_out_to_name), checkoutById: String(row.checked_out_to ?? ''),
      checkoutTime: String(row.checked_out_at), expectedReturnTime: row.expected_return_at ?? undefined,
      returnTime: row.returned_at ?? undefined, returnedCondition: row.returned_condition === 'maintenance' ? 'damaged' : row.returned_condition ?? undefined,
      supervisorId: String(row.checked_out_by), supervisorName: names.get(String(row.checked_out_by)) ?? 'Supervisor',
      farmZone: String(zoneById.get(String(row.farm_zone_id))?.name ?? 'Unassigned') as FarmZone,
      purpose: row.purpose ?? undefined, isReturned: Boolean(row.returned_at),
      isOverdue: !row.returned_at && Boolean(row.expected_return_at) && new Date(row.expected_return_at).getTime() < now,
      notes: row.notes ?? undefined,
    } satisfies EquipmentCheckout;
  });
}

export const subscribeSupabaseEquipment = (organizationId: string, onData: (items: EquipmentCheckout[]) => void, onError?: (error: Error) => void) => subscribe({
  organizationId, tables: ['equipment_checkouts', 'equipment_assets', 'farm_zones'], load: () => loadEquipment(organizationId), onData, onError,
});

export async function checkoutSupabaseEquipment(organizationId: string, checkout: Omit<EquipmentCheckout, 'id'>) {
  const { data, error } = await client().rpc('create_equipment_checkout', {
    p_organization_id: organizationId, p_inventory_item_id: checkout.itemId, p_item_name: checkout.itemName,
    p_checked_out_to_name: checkout.checkoutBy, p_checked_out_at: checkout.checkoutTime,
    p_expected_return_at: checkout.expectedReturnTime ?? null, p_farm_zone_id: await zoneId(organizationId, checkout.farmZone),
    p_purpose: checkout.purpose ?? null, p_notes: checkout.notes ?? null, p_idempotency_key: crypto.randomUUID(),
  });
  check(error, 'Unable to check out the equipment');
  return String(data);
}

export async function returnSupabaseEquipment(organizationId: string, checkoutId: string, condition: 'good' | 'damaged' | 'lost', notes?: string) {
  const { data, error: readError } = await client().from('equipment_checkouts').select('id')
    .eq('organization_id', organizationId).eq('id', checkoutId).maybeSingle();
  check(readError, 'Unable to verify the equipment checkout');
  if (!data) throw new Error('Equipment checkout not found');
  const { error } = await client().rpc('return_equipment_checkout', {
    p_checkout_id: checkoutId, p_condition: condition, p_notes: notes ?? null, p_returned_at: new Date().toISOString(),
  });
  check(error, 'Unable to return the equipment');
}

async function loadSprayPlans(organizationId: string): Promise<SprayPlan[]> {
  const [plans, planItems, applications, inventory, balances, unitRows, zones] = await Promise.all([
    paged('spray_plans', organizationId, { column: 'created_at', ascending: false }),
    paged('spray_plan_items', organizationId), paged('spray_applications', organizationId, { column: 'applied_at' }),
    paged('inventory_items', organizationId), paged('inventory_balances', organizationId), units(organizationId), paged('farm_zones', organizationId),
  ]);
  const itemById = new Map(inventory.map(row => [String(row.id), row]));
  const balanceById = new Map(balances.map(row => [String(row.item_id), Number(row.quantity)]));
  const unitById = new Map(unitRows.map(row => [String(row.id), row]));
  const zoneById = new Map(zones.map(row => [String(row.id), row]));
  return plans.filter(row => row.status !== 'archived').map(row => {
    const linkedApplications = applications.filter(item => item.plan_id === row.id);
    return {
      id: String(row.id), planName: String(row.name), farmZone: String(zoneById.get(String(row.farm_zone_id))?.name ?? 'Unassigned') as FarmZone,
      cycle: row.cycle, startDate: row.start_date, endDate: row.end_date, createdBy: String(row.created_by),
      createdAt: row.created_at, status: row.status, totalApplications: Number(row.total_applications), completedApplications: linkedApplications.length,
      applicationHistory: linkedApplications.map(item => ({ appliedAt: item.applied_at, recordedAt: item.created_at, recordedBy: String(item.recorded_by), notes: item.notes ?? undefined })),
      items: planItems.filter(item => item.plan_id === row.id).map(planItem => {
        const inventoryItem = itemById.get(String(planItem.item_id));
        const requestedUnit = unitById.get(String(planItem.requested_unit_id));
        const stockUnit = unitById.get(String(inventoryItem?.stock_unit_id));
        const currentStock = balanceById.get(String(planItem.item_id)) ?? 0;
        const totalStockQuantity = Number(planItem.quantity_per_application_in_stock_unit) * Number(row.total_applications);
        const totalRequestedQuantity = Number(planItem.quantity_per_application) * Number(row.total_applications);
        return {
          itemId: String(planItem.item_id), itemName: String(inventoryItem?.name ?? 'Inventory item'), category: inventoryItem?.category ?? 'other',
          uom: uomCode(String(stockUnit?.code ?? 'units')), requestedUom: uomCode(String(requestedUnit?.code ?? 'units')),
          quantityPerApplication: Number(planItem.quantity_per_application),
          quantityPerApplicationInStockUom: Number(planItem.quantity_per_application_in_stock_unit),
          totalPlannedQty: totalRequestedQuantity, totalPlannedQtyInStockUom: totalStockQuantity,
          currentStockAtPlanTime: currentStock, shortfallQty: Math.max(0, totalStockQuantity - currentStock),
          projectedShortfallDate: planItem.restock_required_by ?? undefined, restockAlertDate: planItem.restock_required_by ?? undefined,
          isStockSufficient: currentStock >= totalStockQuantity,
        };
      }),
      restockAlertSent: false, notes: row.notes ?? undefined,
    } satisfies SprayPlan;
  });
}

export const subscribeSupabaseSprayPlans = (organizationId: string, onData: (items: SprayPlan[]) => void, onError?: (error: Error) => void) => subscribe({
  organizationId, tables: ['spray_plans', 'spray_plan_items', 'spray_applications', 'inventory_items', 'inventory_balances', 'farm_zones'],
  load: () => loadSprayPlans(organizationId), onData, onError,
});

export async function createSupabaseSprayPlan(organizationId: string, plan: Omit<SprayPlan, 'id'>) {
  const { data, error } = await client().rpc('create_spray_plan', {
    p_organization_id: organizationId, p_name: plan.planName, p_farm_zone_id: await zoneId(organizationId, plan.farmZone),
    p_cycle: plan.cycle, p_start_date: plan.startDate, p_end_date: plan.endDate,
    p_total_applications: plan.totalApplications,
    p_items: await Promise.all(plan.items.map(async item => ({
      item_id: item.itemId, unit_id: await unitId(organizationId, item.requestedUom ?? item.uom),
      quantity_per_application: item.quantityPerApplication, restock_required_by: item.restockAlertDate ?? null,
    }))),
    p_notes: plan.notes ?? null, p_idempotency_key: crypto.randomUUID(),
  });
  check(error, 'Unable to create the spray plan');
  return String(data);
}

export async function recordSupabaseSprayApplication(organizationId: string, planId: string, appliedAt: string, notes?: string) {
  const { data, error: readError } = await client().from('spray_plans').select('id').eq('organization_id', organizationId).eq('id', planId).maybeSingle();
  check(readError, 'Unable to verify the spray plan');
  if (!data) throw new Error('Spray plan not found');
  const { error } = await client().rpc('record_spray_application', {
    p_plan_id: planId, p_applied_at: `${appliedAt}T12:00:00.000Z`, p_notes: notes ?? null, p_idempotency_key: crypto.randomUUID(),
  });
  check(error, 'Unable to record the spray application');
}

async function loadAlerts(organizationId: string): Promise<AgricAlert[]> {
  return (await paged('alerts', organizationId, { column: 'created_at', ascending: false })).slice(0, 50).map(row => ({
    id: String(row.id), type: row.alert_type, severity: row.severity, title: String(row.title), message: String(row.message),
    itemId: row.entity_type === 'inventory_item' ? row.entity_id ?? undefined : undefined,
    createdAt: row.created_at, isRead: Boolean(row.read_at), isActionRequired: Boolean(row.action_required), actionUrl: row.action_url ?? undefined,
  }));
}

export const subscribeSupabaseAlerts = (organizationId: string, onData: (items: AgricAlert[]) => void, onError?: (error: Error) => void) => subscribe({
  organizationId, tables: ['alerts'], load: () => loadAlerts(organizationId), onData, onError,
});

export async function addSupabaseAlert(organizationId: string, alert: Omit<AgricAlert, 'id'>) {
  const { error } = await client().rpc('record_alert', {
    p_organization_id: organizationId, p_alert_type: alert.type, p_severity: alert.severity,
    p_title: alert.title, p_message: alert.message, p_entity_type: alert.itemId ? 'inventory_item' : null,
    p_entity_id: alert.itemId ?? null, p_action_url: alert.actionUrl ?? null, p_action_required: alert.isActionRequired,
  });
  check(error, 'Unable to create the farm alert');
}

export async function markSupabaseAlertRead(organizationId: string, alertId: string) {
  const { error } = await client().from('alerts').update({ read_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', alertId);
  check(error, 'Unable to mark the alert as read');
}

export async function checkSupabaseLowStockAlerts(organizationId: string) {
  for (const item of await loadInventory(organizationId)) {
    if (item.currentStock > item.minimumStock) continue;
    const severity = item.currentStock <= item.minimumStock * 0.5 ? 'critical' : 'warning';
    await addSupabaseAlert(organizationId, {
      type: 'low_stock', severity,
      title: `${severity === 'critical' ? 'Critical' : 'Low'} Stock: ${item.name}`,
      message: `${item.name} is at ${item.currentStock} ${item.uom} (minimum: ${item.minimumStock} ${item.uom}). Restock soon.`,
      itemId: item.id, itemName: item.name, createdAt: new Date().toISOString(), isRead: false,
      isActionRequired: severity === 'critical',
    });
  }
}

export async function fetchSupabaseReportData(organizationId: string, startDate: string, endDate: string) {
  const [inventory, usageLogs, packingRecords, shippingRecords, equipmentLog] = await Promise.all([
    loadInventory(organizationId), loadUsage(organizationId), loadSupabasePackingRecords(organizationId),
    loadSupabaseShippingRecords(organizationId), loadEquipment(organizationId),
  ]);
  return {
    inventory,
    usageLogs: usageLogs.filter(item => item.date >= startDate && item.date <= endDate),
    packingRecords: packingRecords.filter(item => item.date >= startDate && item.date <= endDate),
    shippingRecords: shippingRecords.filter(item => item.dispatchDate >= startDate && item.dispatchDate <= endDate),
    equipmentLog: equipmentLog.filter(item => item.checkoutTime.slice(0, 10) >= startDate && item.checkoutTime.slice(0, 10) <= endDate),
  };
}
