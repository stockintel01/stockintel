'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Download, Leaf, PackageCheck, Scale, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DEMO_ZONES,
  reconciliationVariance,
  totalUsage,
  type ReportCategory,
  type WeeklyOperationsReport,
} from '@/lib/reports/agriculture-report';

const CATEGORIES: Array<{ value: 'all' | ReportCategory; label: string }> = [
  { value: 'all', label: 'All inputs' },
  { value: 'fungicide', label: 'Fungicides' },
  { value: 'insecticide', label: 'Insecticides' },
  { value: 'herbicide', label: 'Herbicides' },
  { value: 'fertilizer', label: 'Fertilizers' },
];

function money(value: number): string {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(value);
}

function number(value: number): string {
  return new Intl.NumberFormat('en-GH', { maximumFractionDigits: 2 }).format(value);
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function StockReportDashboard({ reports }: { reports: WeeklyOperationsReport[] }) {
  const [week, setWeek] = useState(reports.at(-1)?.week ?? 1);
  const [category, setCategory] = useState<'all' | ReportCategory>('all');
  const [zone, setZone] = useState<'all' | (typeof DEMO_ZONES)[number]>('all');
  const report = reports.find(item => item.week === week) ?? reports.at(-1)!;
  const rows = useMemo(
    () => report.rows.filter(row => category === 'all' || row.category === category),
    [category, report.rows],
  );

  const stats = useMemo(() => {
    let closingValue = 0;
    let receivedValue = 0;
    let issuedValue = 0;
    let exceptions = 0;
    for (const row of rows) {
      const issued = zone === 'all' ? totalUsage(row) : row.usageByZone[zone] ?? 0;
      closingValue += row.closing * row.unitCost;
      receivedValue += row.received * row.unitCost;
      issuedValue += issued * row.unitCost;
      if (row.closing <= row.minimumStock || Math.abs(reconciliationVariance(row)) > 0.01) exceptions += 1;
    }
    return { closingValue, receivedValue, issuedValue, exceptions };
  }, [rows, zone]);

  const categoryUsage = CATEGORIES.slice(1).map(item => {
    const value = report.rows
      .filter(row => row.category === item.value)
      .reduce((sum, row) => sum + (zone === 'all' ? totalUsage(row) : row.usageByZone[zone] ?? 0) * row.unitCost, 0);
    return { ...item, value };
  });
  const maxUsage = Math.max(...categoryUsage.map(item => item.value), 1);

  function exportCsv() {
    const headers = ['Week', 'Item', 'Category', 'Pack size', 'Base UOM', 'Opening', 'Received', 'Total used', 'Damaged', 'Closing', 'Minimum', 'Variance', 'Status'];
    const lines = [headers.map(csvCell).join(',')];
    for (const row of rows) {
      lines.push([
        report.week, row.itemName, row.category, row.packLabel, row.baseUom, row.opening, row.received,
        totalUsage(row), row.damaged, row.closing, row.minimumStock, reconciliationVariance(row),
        row.closing <= row.minimumStock ? 'Restock' : 'Healthy',
      ].map(csvCell).join(','));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `anonymized-agriculture-report-week-${report.week}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-emerald-800"><ArrowLeft className="h-4 w-4" /> Back to StockIntel Agri</Link>
            <div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-800 p-2.5 text-white"><Leaf className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Interactive client preview</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agricultural stock and usage report</h1></div></div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">A clean weekly view of inventory movement, crop-level usage, unit conversions, stock health, and reconciliation.</p>
          </div>
          <Button onClick={exportCsv} variant="outline" className="border-slate-300 bg-white"><Download className="mr-2 h-4 w-4" /> Export filtered CSV</Button>
        </header>

        <section aria-label="Demo privacy notice" className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Anonymized demonstration data.</strong> Product labels and quantities are representative and do not identify any organization, employee, supplier, or source document.</p>
        </section>

        <section aria-label="Report filters" className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">Reporting week<select value={week} onChange={event => setWeek(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">{reports.map(item => <option key={item.week} value={item.week}>Week {item.week}: {item.startDate} to {item.endDate}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Input category<select value={category} onChange={event => setCategory(event.target.value as 'all' | ReportCategory)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">{CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Usage area<select value={zone} onChange={event => setZone(event.target.value as typeof zone)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="all">All crop blocks</option>{DEMO_ZONES.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        </section>

        <section aria-label="Key report indicators" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Closing stock value', value: money(stats.closingValue), note: 'Across filtered SKUs', icon: PackageCheck },
            { label: 'Received value', value: money(stats.receivedValue), note: 'Normalized to base units', icon: Scale },
            { label: zone === 'all' ? 'Issued value' : `${zone} usage`, value: money(stats.issuedValue), note: 'Auditable usage value', icon: Leaf },
            { label: 'Items needing attention', value: String(stats.exceptions), note: 'Low stock or variance', icon: AlertTriangle },
          ].map(item => <Card key={item.label} className="border-slate-200 shadow-none"><CardContent className="p-4"><item.icon className="mb-4 h-4 w-4 text-emerald-800" /><p className="text-xl font-semibold sm:text-2xl">{item.value}</p><p className="mt-1 text-xs font-medium text-slate-700">{item.label}</p><p className="mt-0.5 text-xs text-slate-500">{item.note}</p></CardContent></Card>)}
        </section>

        <section className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[0.72fr_1.28fr]">
          <Card className="min-w-0 border-slate-200 shadow-none"><CardContent className="p-5"><h2 className="font-semibold">Usage value by category</h2><p className="mt-1 text-xs text-slate-500">Value allows categories with different units to be compared responsibly.</p><div className="mt-6 space-y-5">{categoryUsage.map(item => <div key={item.value}><div className="mb-1.5 flex justify-between text-sm"><span>{item.label}</span><span className="font-medium">{money(item.value)}</span></div><div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-emerald-700 transition-all" style={{ width: `${Math.max(2, (item.value / maxUsage) * 100)}%` }} /></div></div>)}</div></CardContent></Card>
          <Card className="min-w-0 border-slate-200 shadow-none"><CardContent className="min-w-0 p-0"><div className="border-b border-slate-200 p-5"><h2 className="font-semibold">Stock movement and reconciliation</h2><p className="mt-1 text-xs text-slate-500">Opening + received - used - damaged must equal closing stock.</p></div><div className="max-w-full overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-100 text-xs text-slate-600"><tr>{['Input', 'Pack / conversion', 'Opening', 'Received', 'Used', 'Damaged', 'Closing', 'Status'].map(label => <th key={label} className={`px-4 py-3 font-medium ${label === 'Input' || label === 'Pack / conversion' ? 'text-left' : 'text-right'}`}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => { const low = row.closing <= row.minimumStock; return <tr key={row.id} className="hover:bg-slate-50"><td className="px-4 py-3"><p className="font-medium">{row.itemName}</p><p className="text-xs capitalize text-slate-500">{row.category}</p></td><td className="px-4 py-3"><p>{row.packLabel}</p><p className="text-xs text-slate-500">{row.conversionNote}</p></td><td className="px-4 py-3 text-right tabular-nums">{number(row.opening)} {row.baseUom}</td><td className="px-4 py-3 text-right tabular-nums text-emerald-700">{row.received ? `+${number(row.received)}` : '0'} {row.baseUom}</td><td className="px-4 py-3 text-right tabular-nums text-amber-700">-{number(totalUsage(row))} {row.baseUom}</td><td className="px-4 py-3 text-right tabular-nums">{number(row.damaged)} {row.baseUom}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{number(row.closing)} {row.baseUom}</td><td className="px-4 py-3 text-right"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${low ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{low ? 'Restock' : 'Healthy'}</span></td></tr>; })}</tbody></table></div></CardContent></Card>
        </section>

        <p className="py-7 text-center text-xs text-slate-500">Representative client preview. Live workspaces remain private and tenant-isolated.</p>
      </div>
    </main>
  );
}
