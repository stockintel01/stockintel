'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { getDrugPerformance, getExpiryAlerts, type DrugPerformance } from '@/lib/pharmacy-service';
import {
  TrendingUp, TrendingDown, AlertTriangle, Package,
  Calendar, BarChart3, Loader2, RefreshCw, Download,
  Clock, ShieldAlert
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DrugAnalyticsPage() {
  const { organization, inventory } = useAppStore();
  const orgId = organization?.id;

  const [drugs, setDrugs]               = useState<DrugPerformance[]>([]);
  const [expiryAlerts, setExpiryAlerts] = useState<Array<{ id: string; name: string; sku: string; expiryDate: string; quantity: number; daysLeft: number }>>([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState<'all' | 'critical' | 'warning' | 'healthy'>('all');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    try {
      if (orgId) {
        const [perf, expiry] = await Promise.all([
          getDrugPerformance(orgId),
          getExpiryAlerts(orgId, 90),
        ]);
        setDrugs(perf);
        setExpiryAlerts(expiry);
      } else {
        // Derive from Zustand inventory when no orgId (demo mode)
        const derived: DrugPerformance[] = inventory.map(item => {
          const stock = item.quantity ?? 0;
          const reorder = (item as any).reorderLevel ?? 50;
          const avgDaily = (item as any).avgDailySales ?? 1;
          const days = avgDaily > 0 ? Math.floor(stock / avgDaily) : 999;
          const status: DrugPerformance['status'] = days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'healthy';
          return {
            id: item.id, name: item.name, sku: item.sku ?? '',
            currentStock: stock, reorderPoint: reorder,
            avgDailySales: avgDaily, daysUntilStockout: days,
            status, trend: 'stable' as const, trendPercent: 0,
            category: item.category ?? 'General',
            expiryDate: item.expiryDate,
          };
        });
        setDrugs(derived);

        // Expiry alerts from local inventory
        const today = new Date();
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 90);
        setExpiryAlerts(
          inventory
            .filter(i => i.expiryDate && new Date(i.expiryDate) <= cutoff && (i.quantity ?? 0) > 0)
            .map(i => ({
              id: i.id, name: i.name, sku: i.sku ?? '',
              expiryDate: i.expiryDate ?? '',
              quantity: i.quantity ?? 0,
              daysLeft: Math.ceil((new Date(i.expiryDate ?? '').getTime() - today.getTime()) / 86400000),
            }))
            .sort((a, b) => a.daysLeft - b.daysLeft)
        );
      }
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('[DrugAnalytics]', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orgId]);

  const filtered  = filter === 'all' ? drugs : drugs.filter(d => d.status === filter);
  const critical  = drugs.filter(d => d.status === 'critical').length;
  const warning   = drugs.filter(d => d.status === 'warning').length;
  const expiredSoon = expiryAlerts.filter(e => e.daysLeft <= 30).length;

  // Average daily sales velocity
  const avgVelocity = drugs.length > 0
    ? (drugs.reduce((s, d) => s + d.avgDailySales, 0) / drugs.length).toFixed(1)
    : '0';

  function exportCSV() {
    const rows = [
      ['Name', 'SKU', 'Category', 'Stock', 'Reorder Point', 'Avg Daily Sales', 'Days Until Stockout', 'Status', 'Expiry Date'],
      ...drugs.map(d => [d.name, d.sku, d.category, d.currentStock, d.reorderPoint, d.avgDailySales, d.daysUntilStockout, d.status, d.expiryDate ?? '']),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `drug-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Drug Performance Analytics</h1>
          <p className="text-muted-foreground">
            Live stock velocity · Restock predictions · Expiry tracking
            {lastRefreshed && <span className="ml-2 text-xs">· Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-red-500 cursor-pointer" onClick={() => setFilter('critical')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Items</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{loading ? '—' : critical}</div>
            <p className="text-xs text-muted-foreground">≤ 7 days stock remaining</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 cursor-pointer" onClick={() => setFilter('warning')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warning Items</CardTitle>
            <Package className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{loading ? '—' : warning}</div>
            <p className="text-xs text-muted-foreground">8–14 days remaining</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Sales Velocity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{loading ? '—' : avgVelocity}</div>
            <p className="text-xs text-muted-foreground">units/day across all drugs</p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${expiredSoon > 0 ? 'border-l-orange-500' : 'border-l-green-500'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <Clock className={`h-4 w-4 ${expiredSoon > 0 ? 'text-orange-500' : 'text-green-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${expiredSoon > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {loading ? '—' : expiredSoon}
            </div>
            <p className="text-xs text-muted-foreground">Items expiring within 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Expiry Alerts */}
      {expiryAlerts.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center gap-2 text-orange-700">
              <Clock className="w-4 h-4" /> Expiry Alerts ({expiryAlerts.length} items within 90 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-orange-50 border-b border-orange-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Drug Name</th>
                    <th className="text-left px-3 py-2 font-medium">SKU</th>
                    <th className="text-right px-3 py-2 font-medium">Qty in Stock</th>
                    <th className="text-left px-3 py-2 font-medium">Expiry Date</th>
                    <th className="text-right px-3 py-2 font-medium">Days Left</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {expiryAlerts.map(item => (
                    <tr key={item.id} className={item.daysLeft <= 0 ? 'bg-red-50' : item.daysLeft <= 30 ? 'bg-orange-50' : ''}>
                      <td className="px-3 py-2 font-medium">{item.name}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{item.sku}</td>
                      <td className="px-3 py-2 text-right font-mono">{item.quantity}</td>
                      <td className="px-3 py-2">{item.expiryDate}</td>
                      <td className={`px-3 py-2 text-right font-bold ${item.daysLeft <= 0 ? 'text-red-600' : item.daysLeft <= 30 ? 'text-orange-600' : 'text-amber-600'}`}>
                        {item.daysLeft <= 0 ? 'EXPIRED' : `${item.daysLeft}d`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {([['all', 'All Drugs'], ['critical', `Critical (${critical})`], ['warning', `Warning (${warning})`], ['healthy', 'Healthy']] as const).map(([v, l]) => (
          <Button
            key={v}
            variant={filter === v ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(v)}
            className={filter === v && v === 'critical' ? 'bg-red-600 hover:bg-red-700' : filter === v && v === 'warning' ? 'bg-amber-600 hover:bg-amber-700' : ''}
          >
            {l}
          </Button>
        ))}
      </div>

      {/* Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" /> Drug Performance & Predictions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading analytics…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="p-3 text-left font-medium">Drug Name</th>
                    <th className="p-3 text-left font-medium">Category</th>
                    <th className="p-3 text-right font-medium">Stock</th>
                    <th className="p-3 text-right font-medium">Reorder At</th>
                    <th className="p-3 text-right font-medium">Avg Daily Sales</th>
                    <th className="p-3 text-right font-medium">Days Left</th>
                    <th className="p-3 text-left font-medium">Expiry</th>
                    <th className="p-3 text-center font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(drug => (
                    <tr
                      key={drug.id}
                      className={cn(
                        'hover:bg-muted/50 transition-colors',
                        drug.status === 'critical' && 'bg-red-50',
                        drug.status === 'warning' && 'bg-amber-50',
                      )}
                    >
                      <td className="p-3">
                        <p className="font-medium">{drug.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{drug.sku}</p>
                      </td>
                      <td className="p-3">
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">{drug.category}</span>
                      </td>
                      <td className="p-3 text-right font-mono font-medium">{drug.currentStock}</td>
                      <td className="p-3 text-right font-mono text-muted-foreground">{drug.reorderPoint}</td>
                      <td className="p-3 text-right text-muted-foreground">{drug.avgDailySales} /day</td>
                      <td className="p-3 text-right">
                        <span className={cn(
                          'font-bold',
                          drug.daysUntilStockout <= 7 && 'text-red-600',
                          drug.daysUntilStockout > 7 && drug.daysUntilStockout <= 14 && 'text-amber-600',
                          drug.daysUntilStockout > 14 && 'text-green-600',
                        )}>
                          {drug.daysUntilStockout >= 999 ? '∞' : `${drug.daysUntilStockout}d`}
                        </span>
                      </td>
                      <td className="p-3 text-sm">
                        {drug.expiryDate ? (
                          <span className={cn(
                            'font-mono text-xs',
                            new Date(drug.expiryDate) < new Date() && 'text-red-600 font-bold',
                            new Date(drug.expiryDate) < new Date(Date.now() + 30 * 86400000) && new Date(drug.expiryDate) >= new Date() && 'text-orange-600',
                          )}>
                            {drug.expiryDate}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-center">
                        {drug.status === 'critical' && (
                          <Button size="sm" className="bg-red-600 hover:bg-red-700 h-7 text-xs">Restock Now</Button>
                        )}
                        {drug.status === 'warning' && (
                          <Button size="sm" variant="outline" className="border-amber-500 text-amber-700 h-7 text-xs">Plan Restock</Button>
                        )}
                        {drug.status === 'healthy' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs">Details</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-muted-foreground">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No items found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Insights — generated from real data */}
      {!loading && (critical > 0 || warning > 0 || expiredSoon > 0) && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="py-4">
            <CardTitle className="text-blue-900 text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Automated Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2 text-sm text-blue-900">
            {drugs.filter(d => d.status === 'critical').map(d => (
              <div key={d.id} className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-red-600 flex-shrink-0" />
                <p><strong>Urgent:</strong> {d.name} has {d.daysUntilStockout} day{d.daysUntilStockout !== 1 ? 's' : ''} of stock remaining (current: {d.currentStock}). Immediate reorder recommended.</p>
              </div>
            ))}
            {drugs.filter(d => d.status === 'warning').map(d => (
              <div key={d.id} className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p><strong>Monitor:</strong> {d.name} will reach reorder point in ~{d.daysUntilStockout} days. Plan restock before reaching {d.reorderPoint} units.</p>
              </div>
            ))}
            {expiryAlerts.filter(e => e.daysLeft <= 30 && e.daysLeft > 0).map(e => (
              <div key={e.id} className="flex items-start gap-2">
                <Clock className="w-4 h-4 mt-0.5 text-orange-600 flex-shrink-0" />
                <p><strong>Expiry:</strong> {e.name} ({e.quantity} units) expires on {e.expiryDate} ({e.daysLeft} days). Consider discounting or returning to supplier.</p>
              </div>
            ))}
            {expiryAlerts.filter(e => e.daysLeft <= 0).map(e => (
              <div key={e.id} className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-red-600 flex-shrink-0" />
                <p><strong>EXPIRED:</strong> {e.name} ({e.quantity} units) has passed its expiry date and must be removed from dispensing immediately.</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && critical === 0 && warning === 0 && expiredSoon === 0 && drugs.length > 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4 flex items-center gap-3 text-green-800">
            <Package className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium">All stock levels are healthy — no immediate action required.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
