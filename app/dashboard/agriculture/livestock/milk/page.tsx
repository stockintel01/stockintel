'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Download, AlertTriangle } from 'lucide-react';
import { MOCK_MILK_RECORDS, MOCK_FLOCKS } from '@/lib/agric/livestock-mock-data';
import type { MilkProductionRecord } from '@/lib/agric/livestock-types';
import { useAppStore } from '@/lib/store';

const today = new Date().toISOString().slice(0, 10);
const DAIRY_FLOCKS = MOCK_FLOCKS.filter(f => f.purpose === 'dairy' && f.status === 'active');

export default function MilkPage() {
  const { user } = useAppStore();
  const [records, setRecords] = useState<MilkProductionRecord[]>(MOCK_MILK_RECORDS);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    herdId: DAIRY_FLOCKS[0]?.id ?? '',
    date: today, shift: 'morning',
    activeMilkingCows: DAIRY_FLOCKS[0]?.femaleCount ?? 0,
    totalLitres: 0, fatContent: 0, rejected: 0,
    sold: 0, stored: 0, pricePerLitre: 4.5, notes: '',
  });

  const todayRecords  = records.filter(r => r.date === today);
  const todayTotal    = todayRecords.reduce((s, r) => s + r.totalLitres, 0);
  const todayRejected = todayRecords.reduce((s, r) => s + (r.rejected ?? 0), 0);
  const todayRevenue  = todayRecords.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const avgPerCow     = todayRecords.length > 0
    ? (todayTotal / (todayRecords[0]?.activeMilkingCows || 1)).toFixed(1)
    : '—';

  // 7-day rolling
  const last7Days = records.filter(r => r.date >= new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const weekTotal = last7Days.reduce((s, r) => s + r.totalLitres, 0);

  const rejectedAlert = todayRejected > 10;

  function submit() {
    const herd = DAIRY_FLOCKS.find(f => f.id === form.herdId);
    if (!herd || !form.totalLitres) return;
    const revenue = form.sold * form.pricePerLitre;
    const rec: MilkProductionRecord = {
      id: `mp_${Date.now()}`,
      herdId: herd.id, herdName: herd.name,
      date: form.date, shift: form.shift as any,
      activeMilkingCows: form.activeMilkingCows || (herd.femaleCount ?? 0),
      totalLitres: form.totalLitres,
      avgPerCow: form.activeMilkingCows > 0 ? parseFloat((form.totalLitres / form.activeMilkingCows).toFixed(1)) : undefined,
      fatContent: form.fatContent || undefined,
      rejected: form.rejected || undefined,
      sold: form.sold || undefined,
      stored: form.stored || undefined,
      pricePerLitre: form.pricePerLitre,
      revenue: revenue || undefined,
      recordedBy: user?.name ?? 'Farm Manager',
      notes: form.notes || undefined,
    };
    setRecords(prev => [rec, ...prev]);
    setShowForm(false);
    setForm({
      herdId: DAIRY_FLOCKS[0]?.id ?? '', date: today, shift: 'morning',
      activeMilkingCows: DAIRY_FLOCKS[0]?.femaleCount ?? 0,
      totalLitres: 0, fatContent: 0, rejected: 0,
      sold: 0, stored: 0, pricePerLitre: 4.5, notes: '',
    });
  }

  function exportCSV() {
    const rows = [
      ['Date', 'Herd', 'Shift', 'Cows', 'Total (L)', 'Avg/Cow', 'Fat%', 'Rejected (L)', 'Sold (L)', 'Stored (L)', 'Revenue', 'By'],
      ...records.map(r => [r.date, r.herdName, r.shift, r.activeMilkingCows, r.totalLitres, r.avgPerCow ?? '', r.fatContent ?? '', r.rejected ?? '', r.sold ?? '', r.stored ?? '', r.revenue ?? '', r.recordedBy]),
    ];
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(rows.map(r => r.join(',')).join('\n'))}`;
    a.download = `milk-production-${today}.csv`; a.click();
  }

  // Per-day summary for chart
  const dayMap: Record<string, number> = {};
  records.forEach(r => { dayMap[r.date] = (dayMap[r.date] ?? 0) + r.totalLitres; });
  const chartDays = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-7);
  const maxLitres = Math.max(...chartDays.map(([, v]) => v));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🥛 Milk Production</h1>
          <p className="text-muted-foreground text-sm">AM & PM milking records · Quality tracking · Sales</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Log Milking
          </Button>
        </div>
      </div>

      {/* Quality Alert */}
      {rejectedAlert && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <p className="text-red-800"><strong>{todayRejected}L rejected today</strong> — possible mastitis or contamination. Check individual cows and consult vet.</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Today',    value: `${todayTotal}L`,               color: 'border-l-blue-500' },
          { label: 'Avg per Cow',    value: `${avgPerCow}L`,                color: 'border-l-sky-400' },
          { label: 'Rejected Today', value: `${todayRejected}L`,            color: `border-l-${rejectedAlert ? 'red' : 'green'}-500` },
          { label: 'Revenue Today',  value: `GHS ${todayRevenue.toFixed(0)}`, color: 'border-l-green-500' },
          { label: '7-Day Total',    value: `${weekTotal}L`,                color: 'border-l-purple-400' },
        ].map(k => (
          <Card key={k.label} className={`border-l-4 ${k.color}`}>
            <CardContent className="pt-3 pb-3">
              <p className="text-2xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 7-Day Chart */}
      {chartDays.length > 1 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">7-Day Milk Production Trend</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-end gap-2 h-20">
              {chartDays.map(([day, litres], i) => {
                const h = maxLitres > 0 ? (litres / maxLitres) * 72 : 0;
                const isToday = day === today;
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-0.5">
                    <p className="text-xs text-muted-foreground">{litres}L</p>
                    <div
                      className={`w-full rounded-t-sm ${isToday ? 'bg-blue-600' : 'bg-blue-300'}`}
                      style={{ height: `${h}px` }}
                      title={`${day}: ${litres}L`}
                    />
                    <p className="text-xs text-muted-foreground">
                      {new Date(day).toLocaleDateString('en-GB', { weekday: 'short' })}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-muted-foreground border-t pt-2">
              <span>7-day total: <strong className="text-foreground">{weekTotal}L</strong></span>
              <span>Best day: <strong className="text-foreground">{Math.max(...chartDays.map(([, v]) => v))}L</strong></span>
              <span>Est. revenue 7d: <strong className="text-foreground">GHS {(weekTotal * 4.5).toFixed(0)}</strong></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Records Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  {['Date', 'Herd', 'Shift', 'Cows', 'Total (L)', 'Avg/Cow', 'Fat %', 'Rejected', 'Sold', 'Stored', 'Revenue', 'Notes', 'By'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((r, i) => (
                  <tr key={r.id} className={`hover:bg-muted/30 ${(r.rejected ?? 0) > 10 ? 'bg-red-50' : i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                    <td className="px-3 py-2 font-mono text-xs">{r.date}</td>
                    <td className="px-3 py-2 text-xs font-medium">{r.herdName.split('—')[0].trim()}</td>
                    <td className="px-3 py-2 text-xs capitalize">{r.shift}</td>
                    <td className="px-3 py-2 text-center">{r.activeMilkingCows}</td>
                    <td className="px-3 py-2 font-bold">{r.totalLitres}L</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.avgPerCow ? `${r.avgPerCow}L` : '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.fatContent ? `${r.fatContent}%` : '—'}</td>
                    <td className={`px-3 py-2 ${(r.rejected ?? 0) > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {r.rejected ? `${r.rejected}L` : '—'}
                    </td>
                    <td className="px-3 py-2 text-green-700">{r.sold ? `${r.sold}L` : '—'}</td>
                    <td className="px-3 py-2 text-blue-600">{r.stored ? `${r.stored}L` : '—'}</td>
                    <td className="px-3 py-2 font-medium text-green-700">{r.revenue ? `GHS ${r.revenue.toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate">{r.notes ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.recordedBy}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/20 border-t">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-sm font-semibold">Totals</td>
                  <td className="px-3 py-2 font-bold">{records.reduce((s, r) => s + r.totalLitres, 0)}L</td>
                  <td colSpan={2} />
                  <td className="px-3 py-2 text-red-600 font-medium">{records.reduce((s, r) => s + (r.rejected ?? 0), 0)}L rejected</td>
                  <td className="px-3 py-2 text-green-700 font-medium">{records.reduce((s, r) => s + (r.sold ?? 0), 0)}L sold</td>
                  <td colSpan={2} className="px-3 py-2 text-green-700 font-bold">GHS {records.reduce((s, r) => s + (r.revenue ?? 0), 0).toLocaleString()}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                🥛 Log Milking Session <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Herd *</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background"
                  value={form.herdId} onChange={e => {
                    const herd = DAIRY_FLOCKS.find(f => f.id === e.target.value);
                    setForm(f => ({ ...f, herdId: e.target.value, activeMilkingCows: herd?.femaleCount ?? 0 }));
                  }}>
                  {DAIRY_FLOCKS.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Date</label>
                  <Input type="date" className="mt-1" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Shift</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background"
                    value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))}>
                    <option value="morning">Morning</option>
                    <option value="evening">Evening</option>
                    <option value="midday">Midday</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Milking Cows</label>
                  <Input type="number" className="mt-1" value={form.activeMilkingCows}
                    onChange={e => setForm(f => ({ ...f, activeMilkingCows: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Total Litres *</label>
                  <Input type="number" step="0.1" className="mt-1" value={form.totalLitres || ''}
                    onChange={e => setForm(f => ({ ...f, totalLitres: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Rejected (L)</label>
                  <Input type="number" step="0.1" className="mt-1" value={form.rejected || ''}
                    onChange={e => setForm(f => ({ ...f, rejected: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Fat Content %</label>
                  <Input type="number" step="0.1" className="mt-1" placeholder="e.g. 3.8"
                    value={form.fatContent || ''}
                    onChange={e => setForm(f => ({ ...f, fatContent: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Litres Sold</label>
                  <Input type="number" step="0.1" className="mt-1" value={form.sold || ''}
                    onChange={e => setForm(f => ({ ...f, sold: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Price per Litre (GHS)</label>
                  <Input type="number" step="0.1" className="mt-1" value={form.pricePerLitre}
                    onChange={e => setForm(f => ({ ...f, pricePerLitre: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
              {form.totalLitres > 0 && form.activeMilkingCows > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-800">
                  Avg per cow: <strong>{(form.totalLitres / form.activeMilkingCows).toFixed(1)}L</strong>
                  {form.sold > 0 && <> · Revenue: <strong>GHS {(form.sold * form.pricePerLitre).toFixed(2)}</strong></>}
                </div>
              )}
              <Input placeholder="Notes..." value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={submit}
                  disabled={!form.totalLitres}>Save Record</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
