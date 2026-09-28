'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SalesReceiptSettings } from '@/lib/sales/receipt';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import type { FarmZone, PackingRecord, ShippingRecord } from './types';

type Row = Record<string, any>;
type Unsub = () => void;

function db(): SupabaseClient {
  return getBrowserSupabaseClient() as unknown as SupabaseClient;
}

function check(error: { message?: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message ?? 'operation failed'}`);
}

function objectValue(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}

async function currentUserId() {
  const { data, error } = await db().auth.getUser();
  check(error, 'Unable to verify your session');
  if (!data.user) throw new Error('Authentication required');
  return data.user.id;
}

async function pagedRows(
  table: string,
  organizationId: string,
  order?: { column: string; ascending?: boolean },
) {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let query = db().from(table).select('*').eq('organization_id', organizationId);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
    const { data, error } = await query.range(from, from + 999);
    check(error, `Unable to load ${table}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

function subscribeTables<T>(input: {
  organizationId: string;
  tables: string[];
  load: () => Promise<T>;
  onData: (value: T) => void;
  onError?: (error: Error) => void;
}): Unsub {
  const client = db();
  let active = true;
  let loading = false;
  let rerun = false;
  const refresh = async () => {
    if (!active) return;
    if (loading) { rerun = true; return; }
    loading = true;
    try {
      const value = await input.load();
      if (active) input.onData(value);
    } catch (error) {
      if (active) input.onError?.(error instanceof Error ? error : new Error('Unable to refresh packhouse data'));
    } finally {
      loading = false;
      if (rerun) { rerun = false; void refresh(); }
    }
  };

  let channel = client.channel(`packhouse-records:${input.tables.join('-')}:${input.organizationId}:${crypto.randomUUID()}`);
  for (const table of input.tables) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `organization_id=eq.${input.organizationId}` },
      () => void refresh(),
    );
  }
  channel.subscribe((status: string) => { if (status === 'SUBSCRIBED') void refresh(); });
  void refresh();
  return () => { active = false; void client.removeChannel(channel); };
}

async function resolveFarmZoneId(organizationId: string, name: string) {
  const { data, error } = await db().from('farm_zones').select('id')
    .eq('organization_id', organizationId)
    .ilike('name', name.trim())
    .limit(1)
    .maybeSingle();
  check(error, 'Unable to resolve the farm zone');
  return data?.id ?? null;
}

export async function loadSupabasePackingRecords(organizationId: string): Promise<PackingRecord[]> {
  const [records, stations, zones, events] = await Promise.all([
    pagedRows('packing_records', organizationId, { column: 'packed_on', ascending: false }),
    pagedRows('packing_stations', organizationId),
    pagedRows('farm_zones', organizationId),
    pagedRows('packing_quality_events', organizationId, { column: 'inspected_at', ascending: false }),
  ]);
  const stationById = new Map(stations.map(row => [String(row.id), row]));
  const zoneById = new Map(zones.map(row => [String(row.id), row]));
  const latestEvent = new Map<string, Row>();
  for (const event of events) {
    const recordId = String(event.packing_record_id);
    if (!latestEvent.has(recordId)) latestEvent.set(recordId, event);
  }

  return records.filter(row => !row.archived_at).map(row => {
    const details = objectValue(row.details);
    const standard = objectValue(row.quality_standard_snapshot);
    const station = stationById.get(String(row.station_id));
    const zone = zoneById.get(String(row.farm_zone_id));
    const qualityEvent = latestEvent.get(String(row.id));
    return {
      id: String(row.id),
      date: String(row.packed_on),
      stationId: String(row.station_id),
      stationName: String(station?.name ?? details.stationName ?? 'Packing station'),
      supervisorId: String(row.supervisor_id),
      supervisorName: String(row.supervisor_name),
      farmZone: String(zone?.name ?? details.farmZone ?? 'Unassigned') as FarmZone,
      produce: String(row.produce),
      market: row.market,
      destinationCountry: row.destination_country ?? undefined,
      targetBoxes: Number(row.target_packages),
      packedBoxes: Number(row.packed_packages),
      rejectedBoxes: Number(row.rejected_packages),
      totalWeight: row.total_weight_kg == null ? undefined : Number(row.total_weight_kg),
      shift: row.shift,
      workers: Array.isArray(details.workers) ? details.workers.map(String) : [],
      packageType: row.package_type === 'Pending inspection' ? undefined : row.package_type,
      packageSize: row.package_size ?? undefined,
      qualityGrade: row.quality_grade ?? undefined,
      lotNumber: row.lot_number ?? undefined,
      palletId: row.pallet_id ?? undefined,
      storageLocation: row.storage_location ?? undefined,
      inspectionStatus: row.inspection_status,
      inspectedBoxes: Number(row.inspected_packages),
      acceptedBoxes: Number(row.accepted_packages),
      reworkBoxes: Number(row.rework_packages),
      inspectorId: qualityEvent?.inspector_id ? String(qualityEvent.inspector_id) : undefined,
      inspectorName: qualityEvent?.inspector_name ?? undefined,
      inspectedAt: qualityEvent?.inspected_at ?? undefined,
      inspectionNotes: qualityEvent?.notes ?? details.inspectionNotes ?? undefined,
      lastQualityEventId: qualityEvent?.id ? String(qualityEvent.id) : undefined,
      qualityStandardId: standard.id ?? row.quality_standard_id ?? undefined,
      qualityStandardName: standard.name ?? undefined,
      qualityStandardAuthority: standard.authority ?? undefined,
      qualityStandardReference: standard.reference ?? undefined,
      qualityStandardVersion: standard.version ?? undefined,
      qualityStandardSourceUrl: standard.sourceUrl ?? undefined,
      fulfilmentPlanId: row.fulfilment_plan_id ?? undefined,
      fulfilmentOccurrenceDate: row.fulfilment_occurrence_date ?? undefined,
      customerName: details.customerName ?? undefined,
      notes: row.notes ?? undefined,
    } satisfies PackingRecord;
  });
}

export function subscribeSupabasePackingRecords(
  organizationId: string,
  onData: (records: PackingRecord[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeTables({
    organizationId,
    tables: ['packing_records', 'packing_stations', 'farm_zones', 'packing_quality_events'],
    load: () => loadSupabasePackingRecords(organizationId),
    onData,
    onError,
  });
}

export async function addSupabasePackingRecord(
  organizationId: string,
  record: Omit<PackingRecord, 'id'>,
) {
  const userId = await currentUserId();
  const idempotencyKey = crypto.randomUUID();
  const lotNumber = record.lotNumber?.trim() || `PENDING-${record.date.replaceAll('-', '')}-${idempotencyKey.slice(0, 8).toUpperCase()}`;
  const { data, error } = await db().from('packing_records').insert({
    organization_id: organizationId,
    packed_on: record.date,
    station_id: record.stationId,
    supervisor_id: userId,
    supervisor_name: record.supervisorName,
    farm_zone_id: await resolveFarmZoneId(organizationId, record.farmZone),
    produce: record.produce,
    market: record.market ?? 'local',
    destination_country: record.market === 'export' ? record.destinationCountry ?? null : null,
    target_packages: record.targetBoxes,
    packed_packages: record.packedBoxes,
    rejected_packages: 0,
    total_weight_kg: record.totalWeight ?? null,
    shift: record.shift,
    package_type: record.packageType?.trim() || 'Pending inspection',
    package_size: record.packageSize?.trim() || null,
    quality_grade: record.qualityGrade?.trim() || null,
    lot_number: lotNumber,
    pallet_id: record.palletId?.trim() || null,
    storage_location: record.storageLocation?.trim() || null,
    fulfilment_plan_id: record.fulfilmentPlanId || null,
    fulfilment_occurrence_date: record.fulfilmentOccurrenceDate || null,
    notes: record.notes?.trim() || null,
    idempotency_key: idempotencyKey,
    details: {
      workers: record.workers,
      customerName: record.customerName ?? '',
      farmZone: record.farmZone,
      stationName: record.stationName,
    },
  }).select('id').single();
  check(error, 'Unable to create the packing record');
  return String(data?.id);
}

export async function updateSupabasePackingRecord(
  organizationId: string,
  recordId: string,
  changes: Partial<Omit<PackingRecord, 'id'>>,
) {
  const { data: existing, error: readError } = await db().from('packing_records')
    .select('details')
    .eq('organization_id', organizationId)
    .eq('id', recordId)
    .single();
  check(readError, 'Unable to load the packing record');
  const payload: Row = {};
  if (changes.date !== undefined) payload.packed_on = changes.date;
  if (changes.stationId !== undefined) payload.station_id = changes.stationId;
  if (changes.supervisorName !== undefined) payload.supervisor_name = changes.supervisorName;
  if (changes.farmZone !== undefined) payload.farm_zone_id = await resolveFarmZoneId(organizationId, changes.farmZone);
  if (changes.produce !== undefined) payload.produce = changes.produce;
  if (changes.market !== undefined) payload.market = changes.market;
  if (changes.destinationCountry !== undefined || changes.market === 'local') payload.destination_country = changes.market === 'local' ? null : changes.destinationCountry || null;
  if (changes.targetBoxes !== undefined) payload.target_packages = changes.targetBoxes;
  if (changes.packedBoxes !== undefined) payload.packed_packages = changes.packedBoxes;
  if (changes.totalWeight !== undefined) payload.total_weight_kg = changes.totalWeight ?? null;
  if (changes.shift !== undefined) payload.shift = changes.shift;
  if (changes.fulfilmentPlanId !== undefined) payload.fulfilment_plan_id = changes.fulfilmentPlanId || null;
  if (changes.fulfilmentOccurrenceDate !== undefined) payload.fulfilment_occurrence_date = changes.fulfilmentOccurrenceDate || null;
  if (changes.notes !== undefined) payload.notes = changes.notes?.trim() || null;
  payload.details = {
    ...objectValue(existing?.details),
    ...(changes.workers !== undefined ? { workers: changes.workers } : {}),
    ...(changes.customerName !== undefined ? { customerName: changes.customerName ?? '' } : {}),
    ...(changes.farmZone !== undefined ? { farmZone: changes.farmZone } : {}),
    ...(changes.stationName !== undefined ? { stationName: changes.stationName } : {}),
  };
  const { error } = await db().from('packing_records').update(payload)
    .eq('organization_id', organizationId)
    .eq('id', recordId);
  check(error, 'Unable to update the packing record');
}

export async function deleteSupabasePackingRecord(organizationId: string, recordId: string) {
  const { data, error } = await db().from('packing_records').select('id')
    .eq('organization_id', organizationId).eq('id', recordId).maybeSingle();
  check(error, 'Unable to verify the packing record');
  if (!data) throw new Error('Packing record not found');
  const result = await db().rpc('delete_uninspected_packing_record', { p_packing_record_id: recordId });
  check(result.error, 'Unable to delete the packing record');
}

export async function loadSupabaseShippingRecords(organizationId: string): Promise<ShippingRecord[]> {
  const [shipments, allocations, packing, stations, sales, saleItems, payments, customers, receipts] = await Promise.all([
    pagedRows('shipments', organizationId, { column: 'dispatched_at', ascending: false }),
    pagedRows('shipment_allocations', organizationId),
    pagedRows('packing_records', organizationId),
    pagedRows('packing_stations', organizationId),
    pagedRows('sales', organizationId),
    pagedRows('sale_items', organizationId),
    pagedRows('sale_payments', organizationId, { column: 'paid_at', ascending: false }),
    pagedRows('customers', organizationId),
    pagedRows('sales_receipts', organizationId, { column: 'issued_at', ascending: false }),
  ]);
  const packingById = new Map(packing.map(row => [String(row.id), row]));
  const stationById = new Map(stations.map(row => [String(row.id), row]));
  const saleByShipment = new Map(sales.filter(row => !row.archived_at).map(row => [String(row.shipment_id), row]));
  const customerById = new Map(customers.map(row => [String(row.id), row]));

  return shipments.filter(row => !row.archived_at).map(row => {
    const details = objectValue(row.details);
    const standard = objectValue(row.quality_standard_snapshot);
    const station = stationById.get(String(row.station_id));
    const sale = saleByShipment.get(String(row.id));
    const customer = sale ? customerById.get(String(sale.customer_id)) : undefined;
    const item = saleItems.find(entry => entry.sale_id === sale?.id);
    const payment = payments.find(entry => entry.sale_id === sale?.id && !entry.reversal_of);
    const receipt = receipts.find(entry => entry.sale_id === sale?.id && !entry.voided_at);
    return {
      id: String(row.id),
      dispatchDate: String(row.dispatched_at).slice(0, 10),
      destinationId: row.customer_id ?? undefined,
      destinationName: String(row.destination_name),
      supervisorId: String(row.dispatched_by),
      stationId: row.station_id ?? undefined,
      stationName: station?.name ?? details.stationName ?? undefined,
      storageName: station?.storage_name ?? details.storageName ?? undefined,
      produce: String(row.produce),
      market: row.market,
      destinationCountry: row.destination_country ?? undefined,
      qualityStandardId: standard.id ?? undefined,
      qualityStandardName: standard.name ?? undefined,
      qualityStandardReference: standard.reference ?? undefined,
      boxesShipped: Number(row.packages_shipped),
      weightShipped: row.weight_shipped_kg == null ? undefined : Number(row.weight_shipped_kg),
      vehicleId: row.vehicle_identifier ?? undefined,
      driverName: row.driver_name ?? undefined,
      invoiceNumber: details.invoiceNumber || receipt?.receipt_number || sale?.sale_number || undefined,
      saleDocument: Boolean(sale),
      customerContact: customer?.phone ?? details.customerContact ?? undefined,
      customerAddress: customer?.address ?? details.customerAddress ?? undefined,
      unitPricePerBox: item?.unit_price == null ? undefined : Number(item.unit_price),
      currency: sale?.currency ?? undefined,
      subtotal: sale?.subtotal == null ? undefined : Number(sale.subtotal),
      discountAmount: sale?.discount_amount == null ? undefined : Number(sale.discount_amount),
      taxRate: sale?.tax_rate == null ? undefined : Number(sale.tax_rate),
      taxAmount: sale?.tax_amount == null ? undefined : Number(sale.tax_amount),
      totalAmount: sale?.total_amount == null ? undefined : Number(sale.total_amount),
      amountPaid: sale?.amount_paid == null ? undefined : Number(sale.amount_paid),
      paymentMethod: payment?.method ?? details.paymentMethod ?? undefined,
      paymentStatus: sale?.payment_status ?? undefined,
      soldByName: details.soldByName ?? undefined,
      fulfilmentPlanId: details.fulfilmentPlanId || undefined,
      fulfilmentOccurrenceDate: details.fulfilmentOccurrenceDate || undefined,
      allocations: allocations.filter(allocation => allocation.shipment_id === row.id).map(allocation => {
        const source = packingById.get(String(allocation.packing_record_id));
        return {
          packingRecordId: String(allocation.packing_record_id),
          lotNumber: String(source?.lot_number ?? 'Unknown lot'),
          qualityGrade: source?.quality_grade ?? undefined,
          palletId: source?.pallet_id ?? undefined,
          boxes: Number(allocation.packages),
        };
      }),
      notes: row.notes ?? undefined,
    } satisfies ShippingRecord;
  });
}

export function subscribeSupabaseShippingRecords(
  organizationId: string,
  onData: (records: ShippingRecord[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeTables({
    organizationId,
    tables: ['shipments', 'shipment_allocations', 'packing_records', 'packing_stations', 'sales', 'sale_items', 'sale_payments', 'customers', 'sales_receipts'],
    load: () => loadSupabaseShippingRecords(organizationId),
    onData,
    onError,
  });
}

export async function addSupabaseShippingRecord(
  organizationId: string,
  record: Omit<ShippingRecord, 'id'>,
  receiptSettings?: SalesReceiptSettings,
) {
  if (!record.allocations?.length) throw new Error('Select accepted packing lots before dispatching this shipment.');
  let transportProfileId: string | null = null;
  if (record.vehicleId?.trim()) {
    const { data, error } = await db().from('transport_profiles').select('id')
      .eq('organization_id', organizationId)
      .ilike('vehicle_identifier', record.vehicleId.trim())
      .limit(1)
      .maybeSingle();
    check(error, 'Unable to resolve the transport profile');
    transportProfileId = data?.id ?? null;
  }
  const idempotencyKey = crypto.randomUUID();
  const sale = record.saleDocument ? {
    customerContact: record.customerContact ?? '',
    customerAddress: record.customerAddress ?? '',
    unitPricePerBox: record.unitPricePerBox ?? 0,
    currency: record.currency ?? receiptSettings?.currencyCode ?? 'GHS',
    discountAmount: record.discountAmount ?? 0,
    taxRate: record.taxRate ?? 0,
    amountPaid: record.amountPaid ?? 0,
    paymentMethod: record.paymentMethod ?? 'cash',
    invoiceNumber: record.invoiceNumber ?? '',
  } : null;
  const { data, error } = await db().rpc('create_packhouse_dispatch', {
    p_organization_id: organizationId,
    p_allocations: record.allocations.map(allocation => ({
      packing_record_id: allocation.packingRecordId,
      packages: allocation.boxes,
    })),
    p_destination_name: record.destinationName,
    p_market: record.market ?? 'local',
    p_produce: record.produce,
    p_dispatched_at: `${record.dispatchDate}T12:00:00.000Z`,
    p_station_id: record.stationId ?? null,
    p_destination_country: record.market === 'export' ? record.destinationCountry ?? null : null,
    p_transport_profile_id: transportProfileId,
    p_vehicle_identifier: record.vehicleId ?? null,
    p_driver_name: record.driverName ?? null,
    p_weight_shipped_kg: record.weightShipped ?? null,
    p_notes: record.notes ?? null,
    p_details: {
      stationName: record.stationName ?? '',
      storageName: record.storageName ?? '',
      invoiceNumber: record.invoiceNumber ?? '',
      customerContact: record.customerContact ?? '',
      customerAddress: record.customerAddress ?? '',
      paymentMethod: record.paymentMethod ?? '',
      soldByName: record.soldByName ?? '',
      fulfilmentPlanId: record.fulfilmentPlanId ?? '',
      fulfilmentOccurrenceDate: record.fulfilmentOccurrenceDate ?? '',
    },
    p_sale: sale,
    p_receipt_settings: record.saleDocument ? receiptSettings ?? null : null,
    p_idempotency_key: idempotencyKey,
  });
  check(error, 'Unable to dispatch the shipment');
  const result = objectValue(data);
  if (!result.shipmentId) throw new Error('The shipment was created but no shipment reference was returned.');
  return String(result.shipmentId);
}
