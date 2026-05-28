'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  FlaskConical, Plus, Search, Download, Calendar,
  Filter, X, ChevronDown, TrendingUp, BarChart3
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MOCK_AGRIC_INVENTORY, FARM_ZONES, USAGE_HISTORY } from '@/lib/agric/mock-data';
import { useAppStore } from '@/lib/store';
import { useAgric } from '@/lib/agric/useAgric';
import { UsageLog, FarmZone, AgricCategory } from '@/lib/agric/types';

const CATEGORY_COLORS: Record<string, string> = {
  fungicide: 'bg-blue-100 text-blue-800',
  insecticide: 'bg-orange-100 text-orange-800',
  herbicide: 'bg-yellow-100 text-yellow-800',
  fertilizer: 'bg-green-100 text-green-800',
  equipment: 'bg-slate-100 text-slate-800',
  seed: 'bg-purple-100 text-purple-800',
};

// Seed data matching the real usage reports
const SEED_USAGE_LOGS: UsageLog[] = [
  { id: 'ul01', itemId: 'f06', itemName: 'Paraffin Oil', category: 'fungicide', date: '2026-05-26', quantity: 40, uom: 'lt', farmZone: 'Banana', appliedBy: 'Kojo Asante', weekNumber: 22 },
  { id: 'ul02', itemId: 'i04', itemName: 'Reeva', category: 'insecticide', date: '2026-05-25', quantity: 4, uom: 'lt', farmZone: 'Okra', appliedBy: 'Emmanuel Atta', weekNumber: 22 },
  { id: 'ul03', itemId: 'i08', itemName: 'Punto', category: 'insecticide', date: '2026-05-25', quantity: 8, uom: 'kg', farmZone: 'Banana', appliedBy: 'Kwame Frimpong', weekNumber: 22 },
  { id: 'ul04', itemId: 'h01', itemName: 'Kalach 360', category: 'herbicide', date: '2026-05-24', quantity: 7, uom: 'lt', farmZone: 'Tomato', appliedBy: 'Ama Sarpong', weekNumber: 22 },
  { id: 'ul05', itemId: 'fe01', itemName: 'MAP', category: 'fertilizer', date: '2026-05-23', quantity: 120, uom: 'kg', farmZone: 'Okra', appliedBy: 'Daniel Mensah', weekNumber: 22 },
  { id: 'ul06', itemId: 'f07', itemName: 'Serenade ASO SC', category: 'fungicide', date: '2026-05-23', quantity: 6, uom: 'lt', farmZone: 'Banana', appliedBy: 'Kojo Asante', weekNumber: 22 },
  { id: 'ul07', itemId: 'fe02', itemName: 'Urea', category: 'fertilizer', date: '2026-05-22', quantity: 180, uom: 'kg', farmZone: 'Banana', appliedBy: 'Daniel Mensah', weekNumber: 22 },
  { id: 'ul08', itemId: 'f04', itemName: 'NORDOX 75G', category: 'fungicide', date: '2026-05-22', quantity: 5, uom: 'kg', farmZone: 'Papaya', appliedBy: 'Grace Owusu', weekNumber: 22 },
  { id: 'ul09', itemId: 'i01', itemName: 'Spartan 300 OD', category: 'insecticide', date: '2026-05-21', quantity: 2, uom: 'lt', farmZone: 'Okra', appliedBy: 'Emmanuel Atta', weekNumber: 21 },
  { id: 'ul10', itemId: 'f09', itemName: 'Prozole', category: 'fungicide', date: '2026-05-20', quantity: 8, uom: 'lt', farmZone: 'Banana', appliedBy: 'Kojo Asante', weekNumber: 21 },
];

export default function UsageTrackerPage() {
  const { usageLogs: liveLogs, logUsage } = useAgric();
  const { user } = useAppStore();
  const [logs, setLocalLogs] = useState<UsageLog[]>(SEED_USAGE_LOGS);
  useEffect(() => { if (liveLogs.length > 0) setLocalLogs(liveLogs); }, [liveLogs]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AgricCategory | 'all'>('all');
  const [zoneFilter, setZoneFilter] = useState<FarmZone | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const [view, setView] = useState<'list' | 'summary'>('list');
  const [newLog, setNewLog] = useState<Partial<UsageLog>>({
    date: new Date().toISOString().slice(0, 10),
    farmZone: 'Banana',
    category: 'fungicide',
  });

  const filtered = useMemo(() => {
    return logs.filter(log => {
      const matchSearch = log.itemName.toLowerCase().includes(search.toLowerCase()) ||
        log.appliedBy.toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === 'all' || log.category === categoryFilter;
      const matchZone = zoneFilter === 'all' || log.farmZone === zoneFilter;
      const matchFrom = !dateFrom || log.date >= dateFrom;
      const matchTo = !dateTo || log.date <= dateTo;
      return matchSearch && matchCat && matchZone && matchFrom && matchTo;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [logs, search, categoryFilter, zoneFilter, dateFrom, dateTo]);

  // Summary stats
  const summaryByCat = useMemo(() => {
    const map: Record<string, { count: number; items: Record<string, number> }> = {};
    filtered.forEach(log => {
      if (!map[log.category]) map[log.category] = { count: 0, items: {} };
      map[log.category].count += log.quantity;
      map[log.category].items[log.itemName] = (map[log.category].items[log.itemName] || 0) + log.quantity;
    });
    return map;
  }, [filtered]);

  const summaryByZone = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(log => {
      map[log.farmZone] = (map[log.farmZone] || 0) + 1;
    });
    return map;
  }, [filtered]);

  async function submitLog() {
    if (!newLog.itemId || !newLog.quantity || !newLog.farmZone) return;
    const invItem = MOCK_AGRIC_INVENTORY.find(i => i.id === newLog.itemId);
    if (!invItem) return;
    await logUsage({
      itemId: invItem.id, itemName: invItem.name,
      category: invItem.category as AgricCategory,
      date: newLog.date || new Date().toISOString().slice(0, 10),
      quantity: newLog.quantity!,
      uom: invItem.uom as any,
      farmZone: newLog.farmZone as FarmZone,
      appliedBy: newLog.appliedBy || user?.name || 'Unknown',
      batchNumber: newLog.batchNumber,
      notes: newLog.notes,
      weekNumber: getWeekNumber(newLog.date || ''),
    });
    setNewLog({ date: new Date().toISOString().slice(0, 10), farmZone: 'Banana', category: 'fungicide' });
    setShowLogModal(false);
  }

  function getWeekNumber(dateStr: string): number {
    const d = new Date(dateStr);
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  }

  function exportCSV() {
    const rows = [
      ['Date', 'Item', 'Category', 'Quantity', 'UOM', 'Zone', 'Applied By', 'Batch', 'Notes'],
      ...filtered.map(l => [l.date, l.itemName, l.category, l.quantity, l.uom, l.farmZone, l.appliedBy, l.batchNumber || '', l.notes || ''])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `usage-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chemical & Fertilizer Usage Log</h1>
          <p className="text-muted-foreground text-sm">Record every application — feeds into weekly and monthly reports</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowLogModal(true)}>
            <Plus className="w-4 h-4 mr-1" /> Log Usage
          </Button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 border rounded-md p-1 bg-muted/30 w-fit">
        {[['list', 'Log View'], ['summary', 'Summary View']].map(([v, l]) => (
          <button key={v} onClick={() => setView(v as any)}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${view === v ? 'bg-background shadow-sm font-medium' : 'hover:bg-background/60'}`}>{l}</button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search item or applicator..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="border rounded-md px-3 py-2 text-sm bg-background" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as any)}>
              <option value="all">All Categories</option>
              {['fungicide', 'insecticide', 'herbicide', 'fertilizer', 'seed'].map(c => (
                <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            <select className="border rounded-md px-3 py-2 text-sm bg-background" value={zoneFilter} onChange={e => setZoneFilter(e.target.value as any)}>
              <option value="all">All Zones</option>
              {FARM_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <Input type="date" className="w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
              <span className="text-muted-foreground text-sm">→</span>
              <Input type="date" className="w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
            </div>
            {(search || categoryFilter !== 'all' || zoneFilter !== 'all' || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setCategoryFilter('all'); setZoneFilter('all'); setDateFrom(''); setDateTo(''); }}>
                <X className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">{filtered.length} record{filtered.length !== 1 ? 's' : ''} found</p>
        </CardContent>
      </Card>

      {/* Summary View */}
      {view === 'summary' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* By Category */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500" /> Usage by Category
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {Object.entries(summaryByCat).map(([cat, data]) => {
                const maxCount = Math.max(...Object.values(summaryByCat).map(d => d.count));
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[cat]}`}>{cat}</span>
                      <span className="font-mono font-medium">{data.count} units total</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${cat === 'fungicide' ? 'bg-blue-500' : cat === 'insecticide' ? 'bg-orange-500' : cat === 'herbicide' ? 'bg-yellow-500' : cat === 'fertilizer' ? 'bg-green-500' : 'bg-gray-500'}`}
                        style={{ width: `${(data.count / maxCount) * 100}%` }} />
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {Object.entries(data.items).slice(0, 3).map(([item, qty]) => (
                        <div key={item} className="flex justify-between text-xs text-muted-foreground">
                          <span>{item}</span><span>{qty} units</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* By Zone */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" /> Applications by Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {Object.entries(summaryByZone).sort((a, b) => b[1] - a[1]).map(([zone, count]) => {
                  const maxCount = Math.max(...Object.values(summaryByZone));
                  return (
                    <div key={zone}>
                      <div className="flex justify-between text-sm mb-0.5">
                        <span>{zone}</span>
                        <span className="text-muted-foreground">{count} application{count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 6-week trend mini chart */}
              <div className="mt-6 pt-4 border-t">
                <p className="text-sm font-medium mb-3">6-Week Chemical Usage Trend</p>
                <div className="flex items-end gap-1 h-20">
                  {USAGE_HISTORY.map(w => {
                    const total = w.fungicide + w.insecticide + w.herbicide;
                    const maxTotal = Math.max(...USAGE_HISTORY.map(x => x.fungicide + x.insecticide + x.herbicide));
                    return (
                      <div key={w.week} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full flex flex-col justify-end" style={{ height: `${(total / maxTotal) * 64}px` }}>
                          <div className="bg-blue-400 w-full" style={{ height: `${(w.fungicide / total) * 100}%` }} />
                          <div className="bg-orange-400 w-full" style={{ height: `${(w.insecticide / total) * 100}%` }} />
                          <div className="bg-yellow-400 w-full" style={{ height: `${(w.herbicide / total) * 100}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{w.week}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-sm inline-block" />Fungicide</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-400 rounded-sm inline-block" />Insecticide</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-400 rounded-sm inline-block" />Herbicide</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Item</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Quantity</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Zone</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Applied By</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Week</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log, i) => (
                    <tr key={log.id} className={`border-b hover:bg-accent/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                      <td className="px-4 py-3 font-mono text-sm">{log.date}</td>
                      <td className="px-4 py-3 font-medium">{log.itemName}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[log.category]}`}>{log.category}</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold">{log.quantity} {log.uom}</td>
                      <td className="px-4 py-3">{log.farmZone}</td>
                      <td className="px-4 py-3 text-muted-foreground">{log.appliedBy}</td>
                      <td className="px-4 py-3 text-muted-foreground">Wk {log.weekNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <FlaskConical className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No usage logs found</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Usage Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Log Chemical/Fertilizer Usage
                <button onClick={() => setShowLogModal(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium">Date *</label>
                <Input type="date" className="mt-1" value={newLog.date} onChange={e => setNewLog(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Item *</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newLog.itemId || ''} onChange={e => {
                  const item = MOCK_AGRIC_INVENTORY.find(i => i.id === e.target.value);
                  setNewLog(p => ({ ...p, itemId: e.target.value, category: item?.category as AgricCategory }));
                }}>
                  <option value="">Select item...</option>
                  {MOCK_AGRIC_INVENTORY.filter(i => i.isActive && i.category !== 'equipment').map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.category})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Quantity *</label>
                  <Input type="number" step="0.1" className="mt-1" placeholder="0" value={newLog.quantity || ''} onChange={e => setNewLog(p => ({ ...p, quantity: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Farm Zone *</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newLog.farmZone} onChange={e => setNewLog(p => ({ ...p, farmZone: e.target.value as FarmZone }))}>
                    {FARM_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Applied By *</label>
                <Input className="mt-1" placeholder="Worker or team name" value={newLog.appliedBy || ''} onChange={e => setNewLog(p => ({ ...p, appliedBy: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Batch Number</label>
                <Input className="mt-1" placeholder="Optional batch/lot number" value={newLog.batchNumber || ''} onChange={e => setNewLog(p => ({ ...p, batchNumber: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Notes</label>
                <Input className="mt-1" placeholder="Any observations..." value={newLog.notes || ''} onChange={e => setNewLog(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowLogModal(false)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={submitLog} disabled={!newLog.itemId || !newLog.quantity || !newLog.appliedBy}>
                  <FlaskConical className="w-4 h-4 mr-1" /> Log Usage
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
