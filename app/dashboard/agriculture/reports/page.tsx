'use client';

import { useState, useMemo } from 'react';
import {
  BarChart3, Download, Calendar, FileText, ChevronDown,
  TrendingUp, TrendingDown, Minus, Package, Leaf, Boxes,
  FlaskConical, Tractor, Sprout, Bug
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  MOCK_AGRIC_INVENTORY, MOCK_PACKING_RECORDS, MOCK_SHIPPING_RECORDS,
  MOCK_EQUIPMENT_CHECKOUTS, USAGE_HISTORY, MOCK_WEEKLY_REPORT
} from '@/lib/agric/mock-data';
import { useAgric } from '@/lib/agric/useAgric';

type ReportPeriod = 'daily' | 'weekly' | 'monthly';
type ReportType = 'stock' | 'usage' | 'packing' | 'equipment' | 'full';

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  daily: 'Daily Report', weekly: 'Weekly Report', monthly: 'Monthly Report'
};

const CATEGORY_ICONS: Record<string, any> = {
  fungicide: FlaskConical, insecticide: Bug, herbicide: Leaf,
  fertilizer: Sprout, equipment: Tractor, seed: Package,
};

export default function ReportsPage() {
  const { inventory: liveInv, packingRecords: livePacking, shippingRecords: liveShipping, checkouts: liveCheckouts, isLive } = useAgric();
  const [period, setPeriod] = useState<ReportPeriod>('weekly');
  const [reportType, setReportType] = useState<ReportType>('full');
  const [weekNum, setWeekNum] = useState(10);

  // Compute from mock data
  const inventory = (isLive && liveInv.length > 0 ? liveInv : MOCK_AGRIC_INVENTORY).filter(i => i.isActive);
  const criticalItems = inventory.filter(i => i.currentStock <= i.minimumStock * 0.5);
  const lowItems = inventory.filter(i => i.currentStock > i.minimumStock * 0.5 && i.currentStock <= i.minimumStock);
  const inStockItems = inventory.filter(i => i.currentStock > i.minimumStock);

  const categorySummary = useMemo(() => {
    const cats = ['fungicide', 'insecticide', 'herbicide', 'fertilizer', 'equipment', 'seed'];
    return cats.map(cat => {
      const items = inventory.filter(i => i.category === cat);
      const critical = items.filter(i => i.currentStock <= i.minimumStock).length;
      return { cat, count: items.length, critical };
    });
  }, []);

  // Weekly stock movements from the Week 10 report
  const weeklyMovements = MOCK_WEEKLY_REPORT.items;

  // Packing summary
  const packingToday = (isLive && livePacking.length > 0 ? livePacking : MOCK_PACKING_RECORDS).filter(r => r.date === new Date().toISOString().slice(0, 10));
  const totalPacked = packingToday.reduce((s, r) => s + r.packedBoxes, 0);
  const totalTarget = packingToday.reduce((s, r) => s + r.targetBoxes, 0);
  const totalRejected = packingToday.reduce((s, r) => s + r.rejectedBoxes, 0);
  const totalShipped = (isLive && liveShipping.length > 0 ? liveShipping : MOCK_SHIPPING_RECORDS).reduce((s, r) => s + r.boxesShipped, 0);

  // Equipment stats
  const overdueEquip = MOCK_EQUIPMENT_CHECKOUTS.filter(e => e.isOverdue && !e.isReturned).length;
  const currentlyOut = MOCK_EQUIPMENT_CHECKOUTS.filter(e => !e.isReturned).length;

  function exportReport() {
    const lines: string[] = [];
    lines.push(`${PERIOD_LABELS[period].toUpperCase()} — FARM OPERATIONS REPORT`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push(`Week: ${weekNum}`);
    lines.push('');
    lines.push('=== INVENTORY STATUS ===');
    lines.push(`Total Active SKUs: ${inventory.length}`);
    lines.push(`Critical (< 50% min): ${criticalItems.length}`);
    lines.push(`Low Stock: ${lowItems.length}`);
    lines.push(`In Stock: ${inStockItems.length}`);
    lines.push('');
    lines.push('=== STOCK DETAILS ===');
    lines.push('Item,Category,Current Stock,UOM,Min Stock,Status');
    inventory.forEach(i => {
      const status = i.currentStock <= i.minimumStock * 0.5 ? 'CRITICAL' : i.currentStock <= i.minimumStock ? 'LOW' : 'OK';
      lines.push(`${i.name},${i.category},${i.currentStock},${i.uom},${i.minimumStock},${status}`);
    });
    lines.push('');
    lines.push('=== WEEKLY MOVEMENTS ===');
    lines.push('Item,Opening,Received,Total Usage,Damaged,Closing');
    weeklyMovements.forEach(m => {
      lines.push(`${m.itemName},${m.openingStock},${m.received},${m.totalUsage},${m.damaged},${m.closingStock}`);
    });
    lines.push('');
    lines.push('=== PACKING STATION ===');
    lines.push(`Packed Today: ${totalPacked} boxes`);
    lines.push(`Target: ${totalTarget} boxes`);
    lines.push(`Rejected: ${totalRejected} boxes`);
    lines.push(`Total Shipped: ${totalShipped} boxes`);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `farm-report-wk${weekNum}-${period}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
  }

  const weekTrend = (cur: number, prev: number) => {
    if (cur > prev) return { icon: TrendingUp, color: 'text-red-500', label: `+${cur - prev}` };
    if (cur < prev) return { icon: TrendingDown, color: 'text-green-500', label: `${cur - prev}` };
    return { icon: Minus, color: 'text-muted-foreground', label: '0' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Farm Reports</h1>
          <p className="text-muted-foreground text-sm">Daily · Weekly · Monthly — based on your real-time data</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={exportReport}>
          <Download className="w-4 h-4 mr-1" /> Export Report
        </Button>
      </div>

      {/* Report Controls */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Report Period</label>
              <div className="flex gap-1 border rounded-md p-1">
                {(['daily', 'weekly', 'monthly'] as ReportPeriod[]).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded text-sm capitalize transition-colors ${period === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{p}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Report Type</label>
              <select className="border rounded-md px-3 py-2 text-sm bg-background" value={reportType} onChange={e => setReportType(e.target.value as any)}>
                <option value="full">Full Report</option>
                <option value="stock">Stock Only</option>
                <option value="usage">Usage Only</option>
                <option value="packing">Packing Only</option>
                <option value="equipment">Equipment Only</option>
              </select>
            </div>
            {period === 'weekly' && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Week Number</label>
                <div className="flex items-center gap-2">
                  <button className="border rounded px-2 py-1 text-sm" onClick={() => setWeekNum(w => Math.max(1, w - 1))}>−</button>
                  <span className="text-sm font-mono w-16 text-center">Week {weekNum}</span>
                  <button className="border rounded px-2 py-1 text-sm" onClick={() => setWeekNum(w => Math.min(53, w + 1))}>+</button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Header Banner */}
      <div className="bg-green-700 text-white rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-200 text-xs uppercase tracking-widest">Moonlight Fresco Ltd</p>
            <h2 className="text-xl font-bold mt-0.5">
              {PERIOD_LABELS[period]}
              {period === 'weekly' && ` — Week ${weekNum}`}
              {period === 'monthly' && ` — ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`}
              {period === 'daily' && ` — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-green-200 text-xs">Generated</p>
            <p className="text-sm">{new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Section 1: Stock Summary */}
      {(reportType === 'full' || reportType === 'stock') && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="w-5 h-5 text-green-600" /> 1. Inventory Status
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-4">
                <p className="text-3xl font-bold text-green-700">{inStockItems.length}</p>
                <p className="text-sm text-muted-foreground">In Stock</p>
                <p className="text-xs text-green-600 mt-0.5">≥ minimum level</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="pt-4">
                <p className="text-3xl font-bold text-amber-600">{lowItems.length}</p>
                <p className="text-sm text-muted-foreground">Low Stock</p>
                <p className="text-xs text-amber-600 mt-0.5">50–100% of minimum</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="pt-4">
                <p className="text-3xl font-bold text-red-600">{criticalItems.length}</p>
                <p className="text-sm text-muted-foreground">Critical</p>
                <p className="text-xs text-red-600 mt-0.5">{'< 50% of minimum'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Category Breakdown */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm">Inventory by Category</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-3 gap-3">
                {categorySummary.map(({ cat, count, critical }) => {
                  const Icon = CATEGORY_ICONS[cat] || Package;
                  return (
                    <div key={cat} className="flex items-center gap-3 border rounded-lg p-3">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium capitalize text-sm">{cat}</p>
                        <p className="text-xs text-muted-foreground">{count} items{critical > 0 ? ` · ⚠ ${critical} low` : ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Critical Items List */}
          {criticalItems.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="py-4">
                <CardTitle className="text-sm text-red-700">🔴 Items Requiring Immediate Restock</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-2 font-medium text-muted-foreground">Item</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Category</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Current</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Minimum</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Deficit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criticalItems.map(item => (
                      <tr key={item.id} className="border-b">
                        <td className="py-2 font-medium">{item.name}</td>
                        <td className="py-2 capitalize text-muted-foreground text-xs">{item.category}</td>
                        <td className="py-2 text-right text-red-600 font-mono">{item.currentStock} {item.uom}</td>
                        <td className="py-2 text-right font-mono">{item.minimumStock} {item.uom}</td>
                        <td className="py-2 text-right text-red-600 font-mono font-bold">-{(item.minimumStock - item.currentStock).toFixed(1)} {item.uom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Section 2: Weekly Stock Movements (mimics Excel format) */}
      {(reportType === 'full' || reportType === 'usage') && period === 'weekly' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" /> 2. Week {weekNum} Stock Movements
          </h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-blue-700 text-white">
                    <tr>
                      <th className="text-left px-4 py-3">Item</th>
                      <th className="text-left px-4 py-3">Category</th>
                      <th className="text-right px-4 py-3">Opening</th>
                      <th className="text-right px-4 py-3">Received</th>
                      <th className="text-right px-4 py-3">Used</th>
                      <th className="text-right px-4 py-3">Damaged</th>
                      <th className="text-right px-4 py-3 font-bold">Closing</th>
                      <th className="text-center px-4 py-3">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyMovements.map((item, i) => {
                      const trend = weekTrend(item.closingStock, item.openingStock);
                      const TrendIcon = trend.icon;
                      return (
                        <tr key={item.itemId} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                          <td className="px-4 py-2 font-medium">{item.itemName}</td>
                          <td className="px-4 py-2 text-xs capitalize text-muted-foreground">{item.category}</td>
                          <td className="px-4 py-2 text-right font-mono">{item.openingStock} {item.uom}</td>
                          <td className="px-4 py-2 text-right font-mono text-green-600">{item.received > 0 ? `+${item.received}` : '—'}</td>
                          <td className="px-4 py-2 text-right font-mono text-orange-600">{item.totalUsage > 0 ? item.totalUsage : '—'} {item.totalUsage > 0 ? item.uom : ''}</td>
                          <td className="px-4 py-2 text-right font-mono text-red-500">{item.damaged > 0 ? item.damaged : '—'}</td>
                          <td className="px-4 py-2 text-right font-mono font-bold">{item.closingStock} {item.uom}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`flex items-center justify-center gap-0.5 text-xs ${trend.color}`}>
                              <TrendIcon className="w-3 h-3" />{trend.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 6-week usage trend */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm">6-Week Chemical Usage Trend (Wk 5 – Wk 10)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Category</th>
                      {USAGE_HISTORY.map(w => <th key={w.week} className="text-right px-3 py-2 font-medium">{w.week}</th>)}
                      <th className="text-right px-4 py-2 font-medium">Avg/Wk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Fungicide', key: 'fungicide', color: 'text-blue-600' },
                      { label: 'Insecticide', key: 'insecticide', color: 'text-orange-600' },
                      { label: 'Herbicide', key: 'herbicide', color: 'text-yellow-600' },
                      { label: 'Fertilizer', key: 'fertilizer', color: 'text-green-600' },
                    ].map(row => {
                      const values = USAGE_HISTORY.map(w => w[row.key as keyof typeof w] as number);
                      const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
                      return (
                        <tr key={row.key} className="border-b">
                          <td className={`px-4 py-2 font-medium ${row.color}`}>{row.label}</td>
                          {values.map((v, i) => {
                            const max = Math.max(...values);
                            return (
                              <td key={i} className={`px-3 py-2 text-right font-mono ${v === max ? 'font-bold text-red-600' : ''}`}>{v}</td>
                            );
                          })}
                          <td className="px-4 py-2 text-right font-mono font-medium">{avg}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Section 3: Packing & Shipping */}
      {(reportType === 'full' || reportType === 'packing') && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Boxes className="w-5 h-5 text-purple-600" /> 3. Packing Station Performance
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Target', value: totalTarget, unit: 'boxes', color: 'text-blue-600' },
              { label: 'Packed', value: totalPacked, unit: 'boxes', color: 'text-green-600' },
              { label: 'Rejected', value: totalRejected, unit: 'boxes', color: 'text-red-600' },
              { label: 'Efficiency', value: totalTarget > 0 ? `${Math.round((totalPacked / totalTarget) * 100)}%` : 'N/A', unit: '', color: 'text-purple-600' },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-4">
                  <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label} {s.unit}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {MOCK_PACKING_RECORDS.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Station</th>
                      <th className="text-left px-4 py-3 font-medium">Produce</th>
                      <th className="text-left px-4 py-3 font-medium">Shift</th>
                      <th className="text-right px-4 py-3 font-medium">Target</th>
                      <th className="text-right px-4 py-3 font-medium">Packed</th>
                      <th className="text-right px-4 py-3 font-medium">Rejected</th>
                      <th className="text-right px-4 py-3 font-medium">Efficiency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_PACKING_RECORDS.map((r, i) => {
                      const eff = r.targetBoxes > 0 ? Math.round((r.packedBoxes / r.targetBoxes) * 100) : 100;
                      return (
                        <tr key={r.id} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                          <td className="px-4 py-2">{r.stationName}</td>
                          <td className="px-4 py-2">{r.produce}</td>
                          <td className="px-4 py-2 capitalize text-muted-foreground">{r.shift}</td>
                          <td className="px-4 py-2 text-right font-mono">{r.targetBoxes}</td>
                          <td className="px-4 py-2 text-right font-mono text-green-600">{r.packedBoxes}</td>
                          <td className="px-4 py-2 text-right font-mono text-red-500">{r.rejectedBoxes}</td>
                          <td className={`px-4 py-2 text-right font-mono font-bold ${eff >= 90 ? 'text-green-600' : eff >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{eff}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Section 4: Equipment */}
      {(reportType === 'full' || reportType === 'equipment') && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Tractor className="w-5 h-5 text-slate-600" /> 4. Equipment Tracking
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="pt-4"><p className="text-3xl font-bold">{MOCK_EQUIPMENT_CHECKOUTS.length}</p><p className="text-sm text-muted-foreground">Total Transactions</p></CardContent></Card>
            <Card className="border-l-4 border-l-amber-500"><CardContent className="pt-4"><p className="text-3xl font-bold text-amber-600">{currentlyOut}</p><p className="text-sm text-muted-foreground">Currently Out</p></CardContent></Card>
            <Card className="border-l-4 border-l-red-500"><CardContent className="pt-4"><p className="text-3xl font-bold text-red-600">{overdueEquip}</p><p className="text-sm text-muted-foreground">Overdue Returns</p></CardContent></Card>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Item</th>
                    <th className="text-left px-4 py-3 font-medium">Worker</th>
                    <th className="text-left px-4 py-3 font-medium">Zone</th>
                    <th className="text-left px-4 py-3 font-medium">Checked Out</th>
                    <th className="text-left px-4 py-3 font-medium">Returned</th>
                    <th className="text-left px-4 py-3 font-medium">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_EQUIPMENT_CHECKOUTS.map((c, i) => (
                    <tr key={c.id} className={`border-b ${c.isOverdue && !c.isReturned ? 'bg-red-50' : i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                      <td className="px-4 py-2 font-medium">{c.itemName}</td>
                      <td className="px-4 py-2">{c.checkoutBy}</td>
                      <td className="px-4 py-2 text-muted-foreground">{c.farmZone}</td>
                      <td className="px-4 py-2 text-muted-foreground">{new Date(c.checkoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-2">
                        {c.isReturned ? <span className="text-green-600">{new Date(c.returnTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          : c.isOverdue ? <span className="text-red-600 font-medium">OVERDUE</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        {c.returnedCondition ? <span className={`capitalize text-xs px-2 py-0.5 rounded-full ${c.returnedCondition === 'good' ? 'bg-green-100 text-green-700' : c.returnedCondition === 'damaged' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{c.returnedCondition}</span> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Footer */}
      <div className="border-t pt-4 text-center text-xs text-muted-foreground">
        <p>Report generated by StockIntel Agri · {new Date().getFullYear()}</p>
        <p className="mt-0.5">Data reflects real-time farm operations. Export for offline use.</p>
      </div>
    </div>
  );
}
