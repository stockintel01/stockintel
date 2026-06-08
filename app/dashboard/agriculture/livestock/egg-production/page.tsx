'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, Download, X, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2
} from 'lucide-react';
import type { EggProductionRecord, EggSaleRecord } from '@/lib/agric/livestock-types';
import { useAppStore } from '@/lib/store';
import { useLivestock } from '@/lib/agric/useLivestock';

export default function EggProductionPage() {
  const { user } = useAppStore();
  const { eggRecords: records, eggSales: sales, flocks, addRecord } = useLivestock();
  const layerFlocks = flocks.filter(f => f.species === 'chicken_layer' && f.status === 'active');
  const today = new Date().toISOString().slice(0, 10);

  const [activeTab, setActiveTab] = useState<'production' | 'sales' | 'inventory'>('production');
  const [showForm, setShowForm]   = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);

  // Form state - production
  const [form, setForm] = useState({
    flockId: '',
    date: today, shift: 'morning',
    totalEggsCollected: 0, gradeA: 0, gradeB: 0, gradeC: 0,
    dirtyEggs: 0, softShellEggs: 0, collectedBy: user?.name ?? '',
  });

  // Form state - sale
  const [saleForm, setSaleForm] = useState({
    buyerName: '', buyerContact: '', gradeA: 0, gradeB: 0, gradeC: 0,
    pricePerTray: 0, currency: 'GHS', paymentStatus: 'cash' as const,
    invoiceNumber: '', date: today,
  });

  // Derived totals
  const todayRecords    = records.filter(r => r.date === today);
  const totalToday      = todayRecords.reduce((s, r) => s + r.totalEggsCollected, 0);
  const totalGradeA     = todayRecords.reduce((s, r) => s + r.gradeA, 0);
  const totalGradeB     = todayRecords.reduce((s, r) => s + r.gradeB, 0);
  const totalGradeC     = todayRecords.reduce((s, r) => s + r.gradeC, 0);
  const totalDirty      = todayRecords.reduce((s, r) => s + r.dirtyEggs, 0);
  const totalSoftShell  = todayRecords.reduce((s, r) => s + r.softShellEggs, 0);
  const avgLayRate      = todayRecords.length > 0
    ? (todayRecords.reduce((s, r) => s + (r.layRate ?? 0), 0) / todayRecords.length).toFixed(1)
    : '—';

  // 7-day totals
  const weekTotal  = records.filter(r => r.date >= new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)).reduce((s, r) => s + r.totalEggsCollected, 0);
  const weekTrays  = Math.floor(weekTotal / 30);
  const weekCrates = Math.floor(weekTotal / 360);

  // Egg inventory (rolling)
  const totalSold    = sales.reduce((s, r) => s + r.totalEggs, 0);
  const totalProduced = records.reduce((s, r) => s + r.totalEggsCollected, 0);
  const currentStock = totalProduced - totalSold;
  const stockTrays   = Math.floor(currentStock / 30);
  const stockGradeA  = Math.max(0, records.reduce((s, r) => s + r.gradeA, 0) - sales.reduce((s, r) => s + r.gradeA, 0));
  const stockGradeB  = Math.max(0, records.reduce((s, r) => s + r.gradeB, 0) - sales.reduce((s, r) => s + r.gradeB, 0));

  // Lay rate trend arrow
  const productionTrend = [...records].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const eggTrend = productionTrend.map(record => ({
    day: record.date,
    eggs: record.totalEggsCollected,
    layRate: record.layRate ?? 0,
  }));
  const latestRate = parseFloat(productionTrend[productionTrend.length - 1]?.layRate?.toFixed(1) ?? '0');
  const prevRate   = parseFloat(productionTrend[productionTrend.length - 2]?.layRate?.toFixed(1) ?? '0');
  const trending   = latestRate >= prevRate;

  function autoCalcLayRate() {
    const flock = layerFlocks.find(f => f.id === form.flockId);
    if (!flock || !form.totalEggsCollected) return;
    return ((form.totalEggsCollected / flock.currentCount) * 100).toFixed(1);
  }

  async function submitProduction() {
    if (!form.flockId || !form.totalEggsCollected) return;
    const flock = layerFlocks.find(f => f.id === form.flockId)!;
    const layRate = parseFloat(autoCalcLayRate() ?? '0');
    const rec: EggProductionRecord = {
      id: `ep_${Date.now()}`,
      flockId: form.flockId,
      flockName: flock.name,
      date: form.date,
      shift: form.shift as any,
      penHouseId: flock.penHouseId,
      penHouseName: flock.penHouseName,
      totalEggsCollected: form.totalEggsCollected,
      gradeA: form.gradeA,
      gradeB: form.gradeB,
      gradeC: form.gradeC,
      dirtyEggs: form.dirtyEggs,
      softShellEggs: form.softShellEggs,
      layRate,
      activeLayers: flock.currentCount,
      traysCollected: Math.floor(form.totalEggsCollected / 30),
      cratesCollected: Math.floor(form.totalEggsCollected / 360),
      collectedBy: form.collectedBy || user?.name || 'Unknown',
    };
    await addRecord('eggProduction', rec);
    setShowForm(false);
    setForm({ flockId: layerFlocks[0]?.id ?? '', date: today, shift: 'morning', totalEggsCollected: 0, gradeA: 0, gradeB: 0, gradeC: 0, dirtyEggs: 0, softShellEggs: 0, collectedBy: user?.name ?? '' });
  }

  async function submitSale() {
    if (!saleForm.buyerName || !saleForm.pricePerTray) return;
    const totalEggs = saleForm.gradeA + saleForm.gradeB + saleForm.gradeC;
    const trays     = Math.ceil(totalEggs / 30);
    const revenue   = trays * saleForm.pricePerTray;
    const rec: EggSaleRecord = {
      id: `es_${Date.now()}`,
      date: saleForm.date,
      buyerName: saleForm.buyerName,
      buyerContact: saleForm.buyerContact || undefined,
      gradeA: saleForm.gradeA, gradeB: saleForm.gradeB, gradeC: saleForm.gradeC,
      totalEggs, trays,
      pricePerTray: saleForm.pricePerTray,
      currency: saleForm.currency,
      totalRevenue: revenue,
      paymentStatus: saleForm.paymentStatus,
      invoiceNumber: saleForm.invoiceNumber || undefined,
      soldBy: user?.name ?? 'Farm Manager',
    };
    await addRecord('eggSale', rec);
    setShowSaleForm(false);
    setSaleForm({ buyerName: '', buyerContact: '', gradeA: 0, gradeB: 0, gradeC: 0, pricePerTray: 0, currency: 'GHS', paymentStatus: 'cash', invoiceNumber: '', date: today });
  }

  function exportCSV() {
    const rows = [
      ['Date', 'Flock', 'Total Eggs', 'Grade A', 'Grade B', 'Grade C', 'Dirty', 'Soft Shell', 'Trays', 'Lay Rate %', 'Collected By'],
      ...records.map(r => [r.date, r.flockName, r.totalEggsCollected, r.gradeA, r.gradeB, r.gradeC, r.dirtyEggs, r.softShellEggs, r.traysCollected ?? 0, r.layRate ?? '', r.collectedBy]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `egg-production-${today}.csv`;
    a.click();
  }

  // Soft-shell / dirty egg alerts (quality indicators)
  const qualityAlerts = records.filter(r => r.date === today && (r.softShellEggs > 5 || r.dirtyEggs > 20));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">🥚 Egg Production</h1>
          <p className="text-muted-foreground text-sm">Daily collection · Grading · Sales · Inventory</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button variant="outline" size="sm" onClick={() => setShowSaleForm(true)}>💰 Record Sale</Button>
          <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Log Collection
          </Button>
        </div>
      </div>

      {/* Quality Alerts */}
      {qualityAlerts.map(r => (
        <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">{r.flockName.split('—')[0].trim()} — Quality Alert</p>
            {r.softShellEggs > 5 && <p className="text-amber-700">⚠ {r.softShellEggs} soft-shell eggs detected — check calcium/vitamin D supplementation</p>}
            {r.dirtyEggs > 20 && <p className="text-amber-700">⚠ {r.dirtyEggs} dirty eggs — check nesting box cleanliness and litter management</p>}
          </div>
        </div>
      ))}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Eggs Today',    value: totalToday.toLocaleString(),         color: 'border-l-amber-500' },
          { label: 'Lay Rate',      value: `${avgLayRate}%`,                    color: `border-l-${trending ? 'green' : 'red'}-500` },
          { label: 'Trays Today',   value: `${Math.floor(totalToday / 30)}`,    color: 'border-l-blue-400' },
          { label: 'Week Total',    value: `${weekTotal.toLocaleString()}`,      color: 'border-l-purple-400' },
          { label: 'In Stock',      value: `${currentStock.toLocaleString()}`,   color: 'border-l-green-500' },
        ].map(k => (
          <Card key={k.label} className={`border-l-4 ${k.color}`}>
            <CardContent className="pt-3 pb-3">
              <p className="text-2xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[['production', '🥚 Production Log'], ['sales', '💰 Sales Log'], ['inventory', '📦 Inventory']].map(([v, l]) => (
          <button key={v} onClick={() => setActiveTab(v as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === v ? 'border-amber-500 text-amber-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{l}</button>
        ))}
      </div>

      {/* Production Log */}
      {activeTab === 'production' && (
        <div className="space-y-4">
          {/* Today's grading breakdown */}
          {todayRecords.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Today's Egg Grades — {today}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-sm">
                  {[
                    { label: 'Grade A', value: totalGradeA, color: 'text-green-600', bg: 'bg-green-50', desc: 'Premium' },
                    { label: 'Grade B', value: totalGradeB, color: 'text-blue-600',  bg: 'bg-blue-50',  desc: 'Table' },
                    { label: 'Grade C', value: totalGradeC, color: 'text-amber-600', bg: 'bg-amber-50', desc: 'Cracked' },
                    { label: 'Dirty',   value: totalDirty,  color: 'text-orange-600',bg: 'bg-orange-50',desc: 'Rejected' },
                    { label: 'Soft Shell', value: totalSoftShell, color: 'text-red-600', bg: 'bg-red-50', desc: '⚠ Ca deficiency' },
                  ].map(g => (
                    <div key={g.label} className={`${g.bg} rounded-xl p-3`}>
                      <p className={`text-2xl font-bold ${g.color}`}>{g.value}</p>
                      <p className="text-xs font-medium">{g.label}</p>
                      <p className="text-xs text-muted-foreground">{g.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Trays / Crates summary */}
                <div className="flex gap-4 mt-4 pt-3 border-t text-sm text-muted-foreground">
                  <span>📦 <strong className="text-foreground">{Math.floor(totalToday / 30)}</strong> trays (30 eggs)</span>
                  <span>📦 <strong className="text-foreground">{Math.floor(totalToday / 360)}</strong> crates (360 eggs)</span>
                  <span className="ml-auto">
                    {trending
                      ? <span className="text-green-600 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Rate improving vs yesterday</span>
                      : <span className="text-red-500 flex items-center gap-1"><TrendingDown className="w-4 h-4" /> Rate dropped vs yesterday</span>}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lay Rate Chart */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">7-Day Lay Rate & Egg Collection</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-end gap-2 h-20">
                {eggTrend.map((d, i) => {
                  const maxEggs = Math.max(1, ...eggTrend.map(x => x.eggs));
                  const h = (d.eggs / maxEggs) * 72;
                  const isToday = i === eggTrend.length - 1;
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5">
                      <p className="text-xs text-muted-foreground">{d.layRate}%</p>
                      <div className={`w-full rounded-t-sm ${isToday ? 'bg-amber-500' : 'bg-amber-200'}`} style={{ height: `${h}px` }} />
                      <p className="text-xs text-muted-foreground">{new Date(d.day).toLocaleDateString('en-GB', { weekday: 'short' })}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground border-t pt-2">
                <span>7-day avg: <strong>{eggTrend.length ? (eggTrend.reduce((s, d) => s + d.layRate, 0) / eggTrend.length).toFixed(1) : '0.0'}%</strong></span>
                <span>Best day: <strong>{eggTrend.length ? Math.max(...eggTrend.map(d => d.layRate)) : 0}%</strong></span>
                <span>Total 7d: <strong>{eggTrend.reduce((s, d) => s + d.eggs, 0).toLocaleString()} eggs</strong></span>
              </div>
            </CardContent>
          </Card>

          {/* Records Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      {['Date', 'Flock', 'Total', 'Grade A', 'Grade B', 'Grade C', 'Dirty', 'Trays', 'Lay Rate', 'Collected By'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-xs text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {records.map((r, i) => (
                      <tr key={r.id} className={`hover:bg-muted/30 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                        <td className="px-3 py-2 font-mono text-xs">{r.date}</td>
                        <td className="px-3 py-2 text-xs max-w-[140px] truncate">{r.flockName.split('—')[0].trim()}</td>
                        <td className="px-3 py-2 font-bold">{r.totalEggsCollected.toLocaleString()}</td>
                        <td className="px-3 py-2 text-green-700 font-medium">{r.gradeA}</td>
                        <td className="px-3 py-2 text-blue-600">{r.gradeB}</td>
                        <td className="px-3 py-2 text-amber-600">{r.gradeC}</td>
                        <td className="px-3 py-2 text-red-500">{r.dirtyEggs}</td>
                        <td className="px-3 py-2">{r.traysCollected ?? Math.floor(r.totalEggsCollected / 30)}</td>
                        <td className="px-3 py-2">
                          <span className={`font-semibold ${(r.layRate ?? 0) >= 90 ? 'text-green-600' : (r.layRate ?? 0) >= 80 ? 'text-amber-600' : 'text-red-500'}`}>
                            {r.layRate?.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{r.collectedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sales Log */}
      {activeTab === 'sales' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    {['Date', 'Buyer', 'Grade A', 'Grade B', 'Grade C', 'Total Eggs', 'Trays', 'Price/Tray', 'Revenue', 'Payment'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-xs text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sales.map(s => (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{s.date}</td>
                      <td className="px-3 py-2 font-medium">{s.buyerName}</td>
                      <td className="px-3 py-2 text-green-700">{s.gradeA}</td>
                      <td className="px-3 py-2 text-blue-600">{s.gradeB}</td>
                      <td className="px-3 py-2 text-amber-600">{s.gradeC}</td>
                      <td className="px-3 py-2 font-bold">{s.totalEggs.toLocaleString()}</td>
                      <td className="px-3 py-2">{s.trays}</td>
                      <td className="px-3 py-2">{s.currency} {s.pricePerTray}</td>
                      <td className="px-3 py-2 font-bold text-green-700">{s.currency} {s.totalRevenue?.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">{(s.paymentStatus ?? '').replace(/_/g, ' ')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/20 border-t font-semibold">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-sm">Total Sales</td>
                    <td className="px-3 py-2">{sales.reduce((s, r) => s + r.totalEggs, 0).toLocaleString()}</td>
                    <td className="px-3 py-2">{sales.reduce((s, r) => s + r.trays, 0)}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-green-700">GHS {sales.reduce((s, r) => s + (r.totalRevenue ?? 0), 0).toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory */}
      {activeTab === 'inventory' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="py-4"><CardTitle className="text-base">Current Egg Stock</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Grade A', value: stockGradeA, color: 'text-green-700', desc: 'Premium — ready for premium buyers' },
                { label: 'Grade B', value: stockGradeB, color: 'text-blue-700',  desc: 'Table eggs — retail / local market' },
                { label: 'Grade C', value: Math.max(0, records.reduce((s,r)=>s+r.gradeC,0) - sales.reduce((s,r)=>s+r.gradeC,0)), color: 'text-amber-700', desc: 'Cracked — bakeries / processing' },
              ].map(g => (
                <div key={g.label} className="flex items-center justify-between border rounded-xl p-3">
                  <div>
                    <p className={`text-2xl font-bold ${g.color}`}>{g.value.toLocaleString()}</p>
                    <p className="text-sm font-medium">{g.label}</p>
                    <p className="text-xs text-muted-foreground">{g.desc}</p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{Math.floor(g.value / 30)} trays</p>
                    <p>{Math.floor(g.value / 360)} crates</p>
                  </div>
                </div>
              ))}
              <div className="bg-muted/30 rounded-xl p-3 flex justify-between items-center">
                <div>
                  <p className="text-xl font-bold">{currentStock.toLocaleString()} eggs</p>
                  <p className="text-sm text-muted-foreground">Total in stock</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{stockTrays} trays</p>
                  <p className="text-sm text-muted-foreground">{Math.floor(stockTrays / 12)} crates</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4"><CardTitle className="text-base">Production vs Sales (7-day)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Total Produced', value: totalProduced, color: 'bg-amber-400' },
                  { label: 'Total Sold',     value: totalSold,     color: 'bg-green-500' },
                  { label: 'In Stock',       value: currentStock,  color: 'bg-blue-400'  },
                ].map(item => {
                  const maxVal = Math.max(totalProduced, totalSold, currentStock);
                  return (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-bold">{item.value.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full`} style={{ width: `${(item.value / maxVal) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t text-sm space-y-1 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Estimated Stock Value (Grade A @ GHS 38/tray)</span>
                  <span className="font-semibold text-foreground">GHS {(Math.floor(stockGradeA / 30) * 38).toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Log Collection Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                🥚 Log Egg Collection <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase">Flock *</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={form.flockId} onChange={e => setForm(f => ({ ...f, flockId: e.target.value }))}>
                    <option value="">Select layer flock</option>{layerFlocks.map(fl => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Date</label>
                  <Input type="date" className="mt-1" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Shift</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))}>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="all_day">All Day</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Total Eggs *</label>
                  <Input type="number" className="mt-1" value={form.totalEggsCollected || ''} onChange={e => setForm(f => ({ ...f, totalEggsCollected: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Grade A</label>
                  <Input type="number" className="mt-1" value={form.gradeA || ''} onChange={e => setForm(f => ({ ...f, gradeA: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Grade B</label>
                  <Input type="number" className="mt-1" value={form.gradeB || ''} onChange={e => setForm(f => ({ ...f, gradeB: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Grade C (Cracked)</label>
                  <Input type="number" className="mt-1" value={form.gradeC || ''} onChange={e => setForm(f => ({ ...f, gradeC: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Dirty Eggs</label>
                  <Input type="number" className="mt-1" value={form.dirtyEggs || ''} onChange={e => setForm(f => ({ ...f, dirtyEggs: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Soft Shell Eggs</label>
                  <Input type="number" className="mt-1" value={form.softShellEggs || ''} onChange={e => setForm(f => ({ ...f, softShellEggs: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Collected By</label>
                  <Input className="mt-1" value={form.collectedBy} onChange={e => setForm(f => ({ ...f, collectedBy: e.target.value }))} />
                </div>
              </div>
              {form.totalEggsCollected > 0 && form.flockId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <p className="font-medium text-amber-800">Auto-calculated metrics</p>
                  <p className="text-amber-700">Lay Rate: <strong>{autoCalcLayRate()}%</strong> · Trays: <strong>{Math.floor(form.totalEggsCollected / 30)}</strong> · Crates: <strong>{Math.floor(form.totalEggsCollected / 360)}</strong></p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={submitProduction} disabled={!form.totalEggsCollected}>
                  Save Collection
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sale Form Modal */}
      {showSaleForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">💰 Record Egg Sale <button onClick={() => setShowSaleForm(false)}><X className="w-4 h-4" /></button></CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase">Buyer Name *</label>
                  <Input className="mt-1" placeholder="e.g. Accra Egg Distributors" value={saleForm.buyerName} onChange={e => setSaleForm(f => ({ ...f, buyerName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Buyer Contact</label>
                  <Input className="mt-1" placeholder="+233 xx xxx xxxx" value={saleForm.buyerContact} onChange={e => setSaleForm(f => ({ ...f, buyerContact: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Date</label>
                  <Input type="date" className="mt-1" value={saleForm.date} onChange={e => setSaleForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Grade A Eggs</label>
                  <Input type="number" className="mt-1" value={saleForm.gradeA || ''} onChange={e => setSaleForm(f => ({ ...f, gradeA: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Grade B Eggs</label>
                  <Input type="number" className="mt-1" value={saleForm.gradeB || ''} onChange={e => setSaleForm(f => ({ ...f, gradeB: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Price Per Tray *</label>
                  <Input type="number" className="mt-1" placeholder="e.g. 38" value={saleForm.pricePerTray || ''} onChange={e => setSaleForm(f => ({ ...f, pricePerTray: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Payment Method</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={saleForm.paymentStatus} onChange={e => setSaleForm(f => ({ ...f, paymentStatus: e.target.value as any }))}>
                    <option value="cash">Cash</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Invoice Number</label>
                  <Input className="mt-1" placeholder="INV-EGG-..." value={saleForm.invoiceNumber} onChange={e => setSaleForm(f => ({ ...f, invoiceNumber: e.target.value }))} />
                </div>
              </div>
              {saleForm.pricePerTray > 0 && (saleForm.gradeA + saleForm.gradeB + saleForm.gradeC) > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                  <p><strong>Total:</strong> {saleForm.gradeA + saleForm.gradeB + saleForm.gradeC} eggs · {Math.ceil((saleForm.gradeA + saleForm.gradeB + saleForm.gradeC) / 30)} trays · <strong>Revenue: {saleForm.currency} {(Math.ceil((saleForm.gradeA + saleForm.gradeB + saleForm.gradeC) / 30) * saleForm.pricePerTray).toLocaleString()}</strong></p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowSaleForm(false)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={submitSale} disabled={!saleForm.buyerName || !saleForm.pricePerTray}>Save Sale</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
