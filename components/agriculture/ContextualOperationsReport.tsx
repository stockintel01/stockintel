'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  Download,
  Package,
  Printer,
  ShieldCheck,
  Tractor,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAgricultureProfile } from '@/lib/agric/config';
import {
  acceptedPackingBoxes,
  buildPackingFulfilmentOccurrences,
  packingCalendarDate,
} from '@/lib/agric/packing';
import type {
  AgricCategory,
  AgricInventoryItem,
  EquipmentCheckout,
  PackingFulfilmentPlan,
  PackingRecord,
  ShippingRecord,
  UsageLog,
} from '@/lib/agric/types';
import { getFarmWeek } from '@/lib/agric/week';
import { exportToCSV, exportToPDF, type ExportRow } from '@/lib/export';
import { useAppStore } from '@/lib/store';

export type ContextualReportModule = 'stock' | 'usage' | 'equipment' | 'packing';
type ReportPeriod = 'week' | 'month' | 'year' | 'custom' | 'all';

interface ContextualOperationsReportProps {
  module: ContextualReportModule;
  inventory?: AgricInventoryItem[];
  usageLogs?: UsageLog[];
  checkouts?: EquipmentCheckout[];
  packingRecords?: PackingRecord[];
  shippingRecords?: ShippingRecord[];
  packingPlans?: PackingFulfilmentPlan[];
}

const MODULE_COPY: Record<ContextualReportModule, { title: string; description: string; icon: typeof Package }> = {
  stock: { title: 'Stock report', description: 'Current stock position, reorder exposure and item-level balances.', icon: Package },
  usage: { title: 'Usage report', description: 'Input consumption by item, unit, farm area and reporting period.', icon: BarChart3 },
  equipment: { title: 'Equipment report', description: 'Checkout, return, overdue and condition history for the selected period.', icon: Tractor },
  packing: { title: 'Packhouse report', description: 'Output, acceptance, shipment, market and quality-standard performance.', icon: Boxes },
};

const CATEGORY_LABELS: Record<AgricCategory, string> = {
  fungicide: 'Fungicide',
  insecticide: 'Insecticide',
  herbicide: 'Herbicide',
  fertilizer: 'Fertilizer',
  equipment: 'Equipment',
  seed: 'Seed',
  other: 'Other',
};

function iso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthEnd(month: string): string {
  const [year, value] = month.split('-').map(Number);
  return iso(new Date(year, value, 0));
}

function farmWeekRange(year: number, week: number, weekStartsOn: number): { from: string; to: string } {
  const cursor = new Date(year, 0, 1);
  const last = new Date(year, 11, 31);
  while (cursor <= last) {
    const range = getFarmWeek(cursor, weekStartsOn);
    if (range.year === year && range.week === week) return { from: range.startDate, to: range.endDate };
    cursor.setDate(cursor.getDate() + 1);
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function stockStatus(item: AgricInventoryItem): 'Out of stock' | 'Critical' | 'Low' | 'In stock' {
  if (item.currentStock <= 0) return 'Out of stock';
  if (item.currentStock <= item.minimumStock * 0.5) return 'Critical';
  if (item.currentStock <= item.minimumStock) return 'Low';
  return 'In stock';
}

function StatCard({ label, value, detail, tone = 'text-foreground' }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <Card><CardContent className="pt-5"><p className={`text-3xl font-bold tracking-tight ${tone}`}>{value}</p><p className="mt-1 text-sm font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

export function ContextualOperationsReport({
  module,
  inventory = [],
  usageLogs = [],
  checkouts = [],
  packingRecords = [],
  shippingRecords = [],
  packingPlans = [],
}: ContextualOperationsReportProps) {
  const { organization } = useAppStore();
  const profile = getAgricultureProfile(organization?.settings);
  const today = packingCalendarDate();
  const currentWeek = getFarmWeek(today, profile.weekStartsOn);
  const [period, setPeriod] = useState<ReportPeriod>(module === 'stock' ? 'all' : 'week');
  const [year, setYear] = useState(currentWeek.year);
  const [week, setWeek] = useState(currentWeek.week);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [fromDate, setFromDate] = useState(`${currentWeek.year}-01-01`);
  const [toDate, setToDate] = useState(today);
  const [category, setCategory] = useState<AgricCategory | 'all'>('all');
  const [zone, setZone] = useState('all');
  const [market, setMarket] = useState<'all' | 'local' | 'export'>('all');
  const [message, setMessage] = useState('');

  const activeInventory = inventory.filter(item => item.isActive);
  const copy = MODULE_COPY[module];
  const ReportIcon = copy.icon;

  const range = useMemo(() => {
    if (period === 'week') return farmWeekRange(year, week, profile.weekStartsOn);
    if (period === 'month') return { from: `${month}-01`, to: monthEnd(month) };
    if (period === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` };
    if (period === 'custom') return { from: fromDate, to: toDate };
    const datedValues = [
      ...usageLogs.map(item => item.date),
      ...checkouts.map(item => item.checkoutTime.slice(0, 10)),
      ...packingRecords.map(item => item.date),
      ...shippingRecords.map(item => item.dispatchDate),
    ].filter(Boolean).sort();
    return { from: datedValues[0] ?? `${currentWeek.year}-01-01`, to: datedValues.at(-1) ?? today };
  }, [checkouts, currentWeek.year, fromDate, month, packingRecords, period, profile.weekStartsOn, shippingRecords, toDate, today, usageLogs, week, year]);

  const rangeLabel = period === 'week'
    ? `Week ${week}, ${year}`
    : period === 'month'
      ? new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : period === 'year'
        ? String(year)
        : period === 'custom'
          ? `${fromDate || 'First record'} to ${toDate || 'Latest record'}`
          : 'All available records';

  const filteredInventory = activeInventory.filter(item => category === 'all' || item.category === category);
  const filteredUsage = usageLogs.filter(item => item.date >= range.from && item.date <= range.to)
    .filter(item => category === 'all' || item.category === category)
    .filter(item => zone === 'all' || item.farmZone === zone);
  const filteredCheckouts = checkouts.filter(item => {
    const date = item.checkoutTime.slice(0, 10);
    return date >= range.from && date <= range.to && (zone === 'all' || item.farmZone === zone);
  });
  const filteredPacking = packingRecords.filter(item => item.date >= range.from && item.date <= range.to)
    .filter(item => market === 'all' || (item.market ?? 'local') === market);
  const filteredShipping = shippingRecords.filter(item => item.dispatchDate >= range.from && item.dispatchDate <= range.to)
    .filter(item => market === 'all' || (item.market ?? 'local') === market);
  const reportPackingPlans = packingPlans.filter(item => market === 'all' || (item.market ?? 'local') === market);
  const packingOccurrences = buildPackingFulfilmentOccurrences(reportPackingPlans, filteredPacking, filteredShipping, range.from, range.to, today);

  const knownZones = Array.from(new Set([
    ...profile.farmZones,
    ...usageLogs.map(item => item.farmZone),
    ...checkouts.map(item => item.farmZone),
  ])).filter(Boolean).sort();
  const years = Array.from(new Set([
    currentWeek.year,
    ...usageLogs.map(item => Number(item.date.slice(0, 4))),
    ...checkouts.map(item => Number(item.checkoutTime.slice(0, 4))),
    ...packingRecords.map(item => Number(item.date.slice(0, 4))),
  ])).filter(Number.isFinite).sort((left, right) => right - left);

  const usageByItem = useMemo(() => {
    const result = new Map<string, { item: string; category: AgricCategory; uom: string; quantity: number; applications: number }>();
    filteredUsage.forEach(log => {
      const key = `${log.itemId}|${log.uom}`;
      const current = result.get(key) ?? { item: log.itemName, category: log.category, uom: log.uom, quantity: 0, applications: 0 };
      current.quantity += log.quantity;
      current.applications += 1;
      result.set(key, current);
    });
    return Array.from(result.values()).sort((left, right) => right.applications - left.applications || left.item.localeCompare(right.item));
  }, [filteredUsage]);

  const occurrenceKeys = new Set(packingOccurrences.map(item => item.key));
  const archivedScheduleTargets = new Map<string, number>();
  filteredPacking.filter(item => item.fulfilmentPlanId && item.fulfilmentOccurrenceDate).forEach(item => {
    const key = `${item.fulfilmentPlanId}|${item.fulfilmentOccurrenceDate}`;
    if (!occurrenceKeys.has(key)) archivedScheduleTargets.set(key, Math.max(archivedScheduleTargets.get(key) ?? 0, item.targetBoxes));
  });
  const targetBoxes = packingOccurrences.reduce((sum, item) => sum + item.plan.targetBoxes, 0)
    + filteredPacking.filter(item => !item.fulfilmentPlanId).reduce((sum, item) => sum + Math.max(0, item.targetBoxes), 0)
    + Array.from(archivedScheduleTargets.values()).reduce((sum, value) => sum + value, 0);
  const packedBoxes = filteredPacking.reduce((sum, item) => sum + Math.max(0, item.packedBoxes), 0);
  const acceptedBoxes = filteredPacking.reduce((sum, item) => sum + acceptedPackingBoxes(item), 0);
  const rejectedBoxes = filteredPacking.reduce((sum, item) => sum + Math.max(0, item.rejectedBoxes), 0);
  const shippedBoxes = filteredShipping.reduce((sum, item) => sum + Math.max(0, item.boxesShipped), 0);
  const inspectedLots = filteredPacking.filter(item => (item.inspectedBoxes ?? 0) > 0);
  const standardLinkedLots = inspectedLots.filter(item => item.qualityStandardReference);

  function rowsForExport(): ExportRow[] {
    if (module === 'stock') return filteredInventory.map(item => ({
      item: item.name,
      category: CATEGORY_LABELS[item.category],
      component: item.chemicalComponent ?? '',
      currentStock: item.currentStock,
      unit: item.uom,
      minimumStock: item.minimumStock,
      deficitToMinimum: Math.max(0, item.minimumStock - item.currentStock),
      status: stockStatus(item),
      location: item.location ?? '',
      lastUpdated: item.lastUpdated,
    }));
    if (module === 'usage') return filteredUsage.map(item => ({
      date: item.date,
      farmWeek: item.weekNumber ?? '',
      item: item.itemName,
      category: CATEGORY_LABELS[item.category],
      quantity: item.quantity,
      unit: item.uom,
      farmArea: item.farmZone,
      appliedBy: item.appliedBy,
      batch: item.batchNumber ?? '',
      sourceRequest: item.sourceRequestNumber ?? '',
    }));
    if (module === 'equipment') return filteredCheckouts.map(item => ({
      item: item.itemName,
      worker: item.checkoutBy,
      farmArea: item.farmZone,
      checkedOut: item.checkoutTime,
      expectedReturn: item.expectedReturnTime ?? '',
      returnedAt: item.returnTime ?? '',
      status: item.isReturned ? 'Returned' : item.isOverdue ? 'Overdue' : 'Out',
      returnCondition: item.returnedCondition ?? '',
      purpose: item.purpose ?? '',
      supervisor: item.supervisorName,
    }));
    return filteredPacking.map(item => ({
      date: item.date,
      station: item.stationName,
      produce: item.produce,
      market: item.market ?? 'legacy',
      destinationCountry: item.destinationCountry ?? '',
      targetBoxes: item.targetBoxes,
      packedBoxes: item.packedBoxes,
      acceptedBoxes: acceptedPackingBoxes(item),
      rejectedBoxes: item.rejectedBoxes,
      reworkBoxes: item.reworkBoxes ?? 0,
      inspectionStatus: item.inspectionStatus ?? '',
      qualityGrade: item.qualityGrade ?? '',
      lotNumber: item.lotNumber ?? '',
      standardAuthority: item.qualityStandardAuthority ?? '',
      standardReference: item.qualityStandardReference ?? '',
    }));
  }

  function exportCsv() {
    setMessage('');
    try {
      exportToCSV(rowsForExport(), `${module}-report-${range.from}-to-${range.to}.csv`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The report could not be exported.');
    }
  }

  async function printReport() {
    setMessage('');
    try {
      await exportToPDF(`contextual-${module}-report`, `${module}-report-${range.from}-to-${range.to}.pdf`, `${organization?.name ?? 'Farm'} - ${copy.title} (${rangeLabel})`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The report could not be opened for printing.');
    }
  }

  return <section className="space-y-5" aria-label={copy.title}>
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-green-700">Operational intelligence</p><h2 className="mt-1 flex items-center gap-2 text-xl font-bold"><ReportIcon className="h-5 w-5" />{copy.title}</h2><p className="text-sm text-muted-foreground">{copy.description}</p></div>
      <div className="grid grid-cols-2 gap-2 sm:flex"><Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button><Button variant="outline" onClick={() => void printReport()}><Printer className="mr-2 h-4 w-4" />Print report</Button></div>
    </div>

    {message ? <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div> : null}

    <Card><CardHeader><CardTitle className="text-base">Report filters</CardTitle></CardHeader><CardContent className="space-y-4">
      {module === 'stock' ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><strong>Live stock position.</strong> This report shows balances as they stand now. Historical opening and closing balances require stored stock snapshots and are not inferred from incomplete history.</div> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {module !== 'stock' ? <div className="space-y-1.5"><Label>Period</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={period} onChange={event => setPeriod(event.target.value as ReportPeriod)}><option value="week">Particular week</option><option value="month">Particular month</option><option value="year">Particular year</option><option value="custom">Custom date range</option><option value="all">All records</option></select></div> : null}
        {module !== 'stock' && (period === 'week' || period === 'year') ? <div className="space-y-1.5"><Label>Year</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></div> : null}
        {module !== 'stock' && period === 'week' ? <div className="space-y-1.5"><Label>Farm week</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={week} onChange={event => setWeek(Number(event.target.value))}>{Array.from({ length: 52 }, (_, index) => index + 1).map(value => <option key={value} value={value}>Week {value}</option>)}</select></div> : null}
        {module !== 'stock' && period === 'month' ? <div className="space-y-1.5"><Label>Month</Label><Input type="month" value={month} onChange={event => setMonth(event.target.value)} /></div> : null}
        {module !== 'stock' && period === 'custom' ? <><div className="space-y-1.5"><Label>From</Label><Input type="date" max={toDate} value={fromDate} onChange={event => setFromDate(event.target.value)} /></div><div className="space-y-1.5"><Label>To</Label><Input type="date" min={fromDate} max={today} value={toDate} onChange={event => setToDate(event.target.value)} /></div></> : null}
        {(module === 'stock' || module === 'usage') ? <div className="space-y-1.5"><Label>Category</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={category} onChange={event => setCategory(event.target.value as AgricCategory | 'all')}><option value="all">All categories</option>{Object.entries(CATEGORY_LABELS).filter(([key]) => module === 'stock' || key !== 'equipment').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div> : null}
        {(module === 'usage' || module === 'equipment') ? <div className="space-y-1.5"><Label>Farm area</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={zone} onChange={event => setZone(event.target.value)}><option value="all">All farm areas</option>{knownZones.map(value => <option key={value} value={value}>{value}</option>)}</select></div> : null}
        {module === 'packing' ? <div className="space-y-1.5"><Label>Market</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={market} onChange={event => setMarket(event.target.value as typeof market)}><option value="all">All markets</option><option value="local">Local</option><option value="export">Export</option></select></div> : null}
      </div>
      <div className="flex flex-wrap gap-2"><Badge variant="outline">{module === 'stock' ? `As of ${today}` : rangeLabel}</Badge><Badge variant="outline">{rowsForExport().length} source record{rowsForExport().length === 1 ? '' : 's'}</Badge></div>
    </CardContent></Card>

    <div id={`contextual-${module}-report`} className="space-y-5">
      <div className="rounded-xl bg-green-800 p-4 text-white"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-green-200">{organization?.name ?? 'Agriculture Workspace'}</p><h3 className="mt-1 text-xl font-bold">{copy.title}</h3><p className="mt-1 text-sm text-green-100">{module === 'stock' ? `Current position as of ${today}` : rangeLabel}</p></div>

      {module === 'stock' ? <StockReport inventory={filteredInventory} /> : null}
      {module === 'usage' ? <UsageReport logs={filteredUsage} usageByItem={usageByItem} /> : null}
      {module === 'equipment' ? <EquipmentReport checkouts={filteredCheckouts} /> : null}
      {module === 'packing' ? <PackingReport records={filteredPacking} shippedBoxes={shippedBoxes} acceptedBoxes={acceptedBoxes} rejectedBoxes={rejectedBoxes} packedBoxes={packedBoxes} targetBoxes={targetBoxes} standardLinkedLots={standardLinkedLots.length} inspectedLots={inspectedLots.length} /> : null}
    </div>
  </section>;
}

function StockReport({ inventory }: { inventory: AgricInventoryItem[] }) {
  const out = inventory.filter(item => item.currentStock <= 0);
  const critical = inventory.filter(item => item.currentStock > 0 && item.currentStock <= item.minimumStock * 0.5);
  const low = inventory.filter(item => item.currentStock > item.minimumStock * 0.5 && item.currentStock <= item.minimumStock);
  const healthy = inventory.filter(item => item.currentStock > item.minimumStock);
  return <>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="In stock" value={healthy.length} detail="Above minimum level" tone="text-green-700" /><StatCard label="Low" value={low.length} detail="At or below minimum" tone="text-amber-700" /><StatCard label="Critical" value={critical.length} detail="At or below half minimum" tone="text-red-700" /><StatCard label="Out of stock" value={out.length} detail="No usable balance" tone="text-red-800" /></div>
    <Card><CardHeader><CardTitle className="text-base">Item balances and reorder position</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead className="border-b bg-muted/40"><tr>{['Item', 'Category', 'Current', 'Minimum', 'Deficit', 'Location', 'Status'].map(label => <th key={label} className="px-4 py-3 text-left font-medium text-muted-foreground">{label}</th>)}</tr></thead><tbody>{inventory.map(item => { const status = stockStatus(item); return <tr key={item.id} className="border-b"><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3">{CATEGORY_LABELS[item.category]}</td><td className="px-4 py-3 font-mono">{item.currentStock} {item.uom}</td><td className="px-4 py-3 font-mono">{item.minimumStock} {item.uom}</td><td className="px-4 py-3 font-mono">{Math.max(0, item.minimumStock - item.currentStock)} {item.uom}</td><td className="px-4 py-3 text-muted-foreground">{item.location || 'Not set'}</td><td className="px-4 py-3"><Badge variant={status === 'In stock' ? 'secondary' : 'outline'}>{status}</Badge></td></tr>; })}</tbody></table></div>{!inventory.length ? <p className="py-10 text-center text-sm text-muted-foreground">No stock items match this report.</p> : null}</CardContent></Card>
  </>;
}

function UsageReport({ logs, usageByItem }: { logs: UsageLog[]; usageByItem: Array<{ item: string; category: AgricCategory; uom: string; quantity: number; applications: number }> }) {
  const zones = new Set(logs.map(item => item.farmZone)).size;
  const items = new Set(logs.map(item => item.itemId)).size;
  return <>
    <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Usage records" value={logs.length} detail="Individual recorded applications" tone="text-blue-700" /><StatCard label="Inputs used" value={items} detail="Distinct inventory items" /><StatCard label="Farm areas" value={zones} detail="Areas represented in this report" tone="text-green-700" /></div>
    <Card><CardHeader><CardTitle className="text-base">Usage by item and unit</CardTitle></CardHeader><CardContent className="space-y-3">{usageByItem.map(item => <div key={`${item.item}-${item.uom}`} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><p className="font-medium">{item.item}</p><p className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.category]}</p></div><p className="font-mono font-semibold">{item.quantity.toLocaleString()} {item.uom}</p><Badge variant="outline">{item.applications} record{item.applications === 1 ? '' : 's'}</Badge></div>)}{!usageByItem.length ? <p className="py-8 text-center text-sm text-muted-foreground">No usage records match this period.</p> : null}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Source usage records</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b bg-muted/40"><tr>{['Date', 'Week', 'Item', 'Quantity', 'Farm area', 'Applied by', 'Batch'].map(label => <th key={label} className="px-4 py-3 text-left font-medium text-muted-foreground">{label}</th>)}</tr></thead><tbody>{logs.map(log => <tr key={log.id} className="border-b"><td className="px-4 py-3">{log.date}</td><td className="px-4 py-3">{log.weekNumber ? `W${log.weekNumber}` : 'Not set'}</td><td className="px-4 py-3 font-medium">{log.itemName}</td><td className="px-4 py-3 font-mono">{log.quantity} {log.uom}</td><td className="px-4 py-3">{log.farmZone}</td><td className="px-4 py-3">{log.appliedBy}</td><td className="px-4 py-3 text-muted-foreground">{log.batchNumber || 'Not set'}</td></tr>)}</tbody></table></div></CardContent></Card>
  </>;
}

function EquipmentReport({ checkouts }: { checkouts: EquipmentCheckout[] }) {
  const returned = checkouts.filter(item => item.isReturned);
  const overdue = checkouts.filter(item => item.isOverdue && !item.isReturned);
  const damaged = returned.filter(item => item.returnedCondition === 'damaged' || item.returnedCondition === 'lost');
  const returnRate = checkouts.length ? Math.round(returned.length / checkouts.length * 100) : 0;
  return <>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Checkouts" value={checkouts.length} detail="Transactions in this period" /><StatCard label="Returned" value={returned.length} detail={`${returnRate}% return rate`} tone="text-green-700" /><StatCard label="Overdue" value={overdue.length} detail="Still outstanding" tone="text-red-700" /><StatCard label="Damage or loss" value={damaged.length} detail="Resolved with an exception" tone="text-amber-700" /></div>
    <Card><CardHeader><CardTitle className="text-base">Checkout and return records</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="border-b bg-muted/40"><tr>{['Item', 'Worker', 'Farm area', 'Checked out', 'Expected', 'Returned', 'Condition', 'Status'].map(label => <th key={label} className="px-4 py-3 text-left font-medium text-muted-foreground">{label}</th>)}</tr></thead><tbody>{checkouts.map(item => <tr key={item.id} className="border-b"><td className="px-4 py-3 font-medium">{item.itemName}</td><td className="px-4 py-3">{item.checkoutBy}</td><td className="px-4 py-3">{item.farmZone}</td><td className="px-4 py-3">{new Date(item.checkoutTime).toLocaleString()}</td><td className="px-4 py-3">{item.expectedReturnTime ? new Date(item.expectedReturnTime).toLocaleString() : 'Not set'}</td><td className="px-4 py-3">{item.returnTime ? new Date(item.returnTime).toLocaleString() : 'Not returned'}</td><td className="px-4 py-3 capitalize">{item.returnedCondition ?? 'Pending'}</td><td className="px-4 py-3"><Badge variant="outline">{item.isReturned ? 'Returned' : item.isOverdue ? 'Overdue' : 'Out'}</Badge></td></tr>)}</tbody></table></div>{!checkouts.length ? <p className="py-10 text-center text-sm text-muted-foreground">No equipment transactions match this period.</p> : null}</CardContent></Card>
  </>;
}

function PackingReport({ records, shippedBoxes, acceptedBoxes, rejectedBoxes, packedBoxes, targetBoxes, standardLinkedLots, inspectedLots }: { records: PackingRecord[]; shippedBoxes: number; acceptedBoxes: number; rejectedBoxes: number; packedBoxes: number; targetBoxes: number; standardLinkedLots: number; inspectedLots: number }) {
  const standardCoverage = inspectedLots ? Math.round(standardLinkedLots / inspectedLots * 100) : null;
  const exportBoxes = records.filter(item => item.market === 'export').reduce((sum, item) => sum + item.packedBoxes, 0);
  const localBoxes = records.filter(item => item.market !== 'export').reduce((sum, item) => sum + item.packedBoxes, 0);
  return <>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Packed" value={packedBoxes} detail={targetBoxes ? `Target: ${targetBoxes} boxes` : 'No scheduled target'} tone="text-blue-700" /><StatCard label="Accepted" value={acceptedBoxes} detail={`${rejectedBoxes} rejected boxes`} tone="text-green-700" /><StatCard label="Shipped" value={shippedBoxes} detail="Dispatched in this period" tone="text-violet-700" /><StatCard label="Standards linked" value={standardCoverage === null ? 'Not inspected' : `${standardCoverage}%`} detail={`${standardLinkedLots} of ${inspectedLots} inspected lots`} tone={standardCoverage === 100 ? 'text-green-700' : 'text-amber-700'} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><Card><CardContent className="pt-5"><div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-green-700" /><div><p className="text-2xl font-bold">{localBoxes}</p><p className="text-xs text-muted-foreground">Local-market boxes packed</p></div></div></CardContent></Card><Card><CardContent className="pt-5"><div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-blue-700" /><div><p className="text-2xl font-bold">{exportBoxes}</p><p className="text-xs text-muted-foreground">Export-market boxes packed</p></div></div></CardContent></Card></div>
    {inspectedLots > standardLinkedLots ? <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p>{inspectedLots - standardLinkedLots} inspected lot{inspectedLots - standardLinkedLots === 1 ? '' : 's'} do not have a stored quality-standard reference. Review legacy or incomplete inspections before compliance reporting.</p></div> : null}
    <Card><CardHeader><CardTitle className="text-base">Packing lots and quality outcome</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="border-b bg-muted/40"><tr>{['Date', 'Station', 'Produce', 'Market', 'Destination', 'Packed', 'Accepted', 'Rejected', 'Lot', 'Grade', 'Standard'].map(label => <th key={label} className="px-4 py-3 text-left font-medium text-muted-foreground">{label}</th>)}</tr></thead><tbody>{records.map(item => <tr key={item.id} className="border-b"><td className="px-4 py-3">{item.date}</td><td className="px-4 py-3">{item.stationName}</td><td className="px-4 py-3 font-medium">{item.produce}</td><td className="px-4 py-3 capitalize">{item.market ?? 'Legacy'}</td><td className="px-4 py-3">{item.destinationCountry ?? 'Local'}</td><td className="px-4 py-3 font-mono">{item.packedBoxes}</td><td className="px-4 py-3 font-mono text-green-700">{acceptedPackingBoxes(item)}</td><td className="px-4 py-3 font-mono text-red-700">{item.rejectedBoxes}</td><td className="px-4 py-3">{item.lotNumber ?? 'Pending'}</td><td className="px-4 py-3">{item.qualityGrade ?? 'Pending'}</td><td className="px-4 py-3">{item.qualityStandardReference ?? 'Pending'}</td></tr>)}</tbody></table></div>{!records.length ? <p className="py-10 text-center text-sm text-muted-foreground">No packing records match this period and market.</p> : null}</CardContent></Card>
  </>;
}
