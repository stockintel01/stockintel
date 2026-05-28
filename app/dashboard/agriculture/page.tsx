'use client';

import { useState, useEffect } from 'react';
import {
  Package, AlertTriangle, CheckCircle2, Clock, TrendingUp,
  Leaf, FlaskConical, Bug, Sprout, Tractor, ArrowRight,
  Bell, ChevronRight, BarChart3, ShoppingCart, Users,
  AlertCircle, RefreshCw, Boxes, Cloud, CloudRain, Sun, Wind, Droplets, CloudLightning
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useAgric } from '@/lib/agric/useAgric';
import { USAGE_HISTORY } from '@/lib/agric/mock-data';

const CATEGORY_LABELS: Record<string, string> = {
  fungicide: 'Fungicides', insecticide: 'Insecticides', herbicide: 'Herbicides',
  fertilizer: 'Fertilizers', equipment: 'Equipment', seed: 'Seeds',
};

function getStockStatus(item: { currentStock: number; minimumStock: number; isActive: boolean }) {
  if (!item.isActive) return { label: 'Deleted', dot: 'bg-gray-400' };
  if (item.currentStock === 0) return { label: 'Out of Stock', dot: 'bg-red-500' };
  if (item.currentStock <= item.minimumStock * 0.5) return { label: 'Critical', dot: 'bg-red-500' };
  if (item.currentStock <= item.minimumStock) return { label: 'Low Stock', dot: 'bg-amber-500' };
  return { label: 'In Stock', dot: 'bg-green-500' };
}

// ── Mini Weather Banner ───────────────────────────────────────
function WeatherBanner() {
  const [wx, setWx] = useState<any>(null);
  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=5.6037&longitude=-0.1870&current=temperature_2m,weather_code,wind_speed_10m,precipitation,relative_humidity_2m&timezone=Africa%2FAccra')
      .then(r => r.json()).then(d => setWx(d.current)).catch(() => {});
  }, []);
  if (!wx) return null;
  const code = wx.weather_code;
  const isRaining = code >= 51, isStorm = code >= 95, windHigh = wx.wind_speed_10m > 20;
  let spray: { label: string; color: string; bg: string };
  if (isStorm) spray = { label: '⛈ Thunderstorm — DO NOT SPRAY', color: 'text-red-700', bg: 'bg-red-50 border-red-200' };
  else if (isRaining) spray = { label: '🌧 Raining — Hold spray operations', color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
  else if (windHigh) spray = { label: '💨 High wind — Avoid spraying', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' };
  else spray = { label: '✓ Good spray window right now', color: 'text-green-700', bg: 'bg-green-50 border-green-200' };
  const WxIcon = isStorm ? CloudLightning : isRaining ? CloudRain : code <= 1 ? Sun : Cloud;
  return (
    <Link href="/dashboard/agriculture/weather">
      <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 cursor-pointer hover:shadow-sm transition-shadow ${spray.bg}`}>
        <div className="flex items-center gap-3">
          <WxIcon className="w-6 h-6 text-blue-500" />
          <div>
            <p className="text-sm font-semibold">{wx.temperature_2m.toFixed(1)}°C — Farm Weather</p>
            <p className={`text-xs font-medium ${spray.color}`}>{spray.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Droplets className="w-3 h-3" />{wx.relative_humidity_2m}%</span>
          <span className="flex items-center gap-1"><Wind className="w-3 h-3" />{wx.wind_speed_10m.toFixed(0)} km/h</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}

export default function AgricOverviewPage() {
  const {
    inventory, alerts, requests, checkouts, packingRecords, plans,
    loading, isLive, readAlert,
  } = useAgric();

  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const activeAlerts = alerts.filter(a => !dismissedAlerts.includes(a.id));
  const unreadAlerts = activeAlerts.filter(a => !a.isRead);
  const criticalItems = inventory.filter(i => i.isActive && i.currentStock <= i.minimumStock * 0.5);
  const lowItems = inventory.filter(i => i.isActive && i.currentStock > i.minimumStock * 0.5 && i.currentStock <= i.minimumStock);
  const pendingRequests = requests.filter(r => r.status === 'pending');
  const overdueEquipment = checkouts.filter(e => e.isOverdue && !e.isReturned);
  const today = new Date().toISOString().slice(0, 10);
  const todayPacking = packingRecords.filter(r => r.date === today);
  const totalPackedToday = todayPacking.reduce((s, r) => s + r.packedBoxes, 0);
  const totalTargetToday = todayPacking.reduce((s, r) => s + r.targetBoxes, 0);
  const activePlans = plans.filter(p => p.status === 'active');
  const plansWithShortfall = plans.filter(p => p.items.some(i => !i.isStockSufficient));

  const categoryTotals: Record<string, number> = {};
  ['fungicide', 'insecticide', 'herbicide', 'fertilizer', 'equipment', 'seed'].forEach(cat => {
    categoryTotals[cat] = inventory.filter(i => i.category === cat && i.isActive).length;
  });

  async function handleDismiss(alertId: string) {
    setDismissedAlerts(prev => [...prev, alertId]);
    await readAlert(alertId);
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Leaf className="w-8 h-8 text-green-600" /> Farm Operations
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground text-sm">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            {isLive && (
              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Live
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/agriculture/reports">
            <Button variant="outline" size="sm"><BarChart3 className="w-4 h-4 mr-2" /> Reports</Button>
          </Link>
          <Link href="/dashboard/agriculture/requests">
            <Button size="sm" className="bg-green-600 hover:bg-green-700">
              <ShoppingCart className="w-4 h-4 mr-2" /> New Request
            </Button>
          </Link>
        </div>
      </div>

      {/* Weather */}
      <WeatherBanner />

      {/* Critical Alerts */}
      {unreadAlerts.filter(a => a.severity === 'critical').length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red-800">{unreadAlerts.filter(a => a.severity === 'critical').length} Critical Alert(s)</p>
            {unreadAlerts.filter(a => a.severity === 'critical').map(a => (
              <p key={a.id} className="text-sm text-red-700 mt-0.5">{a.message}</p>
            ))}
          </div>
          <Link href="/dashboard/agriculture/stock-management">
            <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">View</Button>
          </Link>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Items', value: inventory.filter(i => i.isActive).length, sub: 'Active SKUs', color: 'border-l-green-500 text-green-700' },
          { label: 'Low / Critical', value: criticalItems.length + lowItems.length, sub: `${criticalItems.length} critical, ${lowItems.length} low`, color: 'border-l-red-500 text-red-600' },
          { label: 'Pending Requests', value: pendingRequests.length, sub: 'Awaiting dispatch', color: 'border-l-amber-500 text-amber-600' },
          { label: 'Packed Today', value: totalPackedToday, sub: `of ${totalTargetToday} target boxes`, color: 'border-l-blue-500 text-blue-600' },
        ].map(s => (
          <Card key={s.label} className={`border-l-4 ${s.color}`}>
            <CardContent className="pt-4">
              <p className={`text-3xl font-bold ${s.color.split(' ')[1]}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Category Breakdown */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { key: 'fungicide', label: 'Fungicides', icon: FlaskConical },
          { key: 'insecticide', label: 'Insecticides', icon: Bug },
          { key: 'herbicide', label: 'Herbicides', icon: Leaf },
          { key: 'fertilizer', label: 'Fertilizers', icon: Sprout },
          { key: 'equipment', label: 'Equipment', icon: Tractor },
          { key: 'seed', label: 'Seeds', icon: Package },
        ].map(({ key, label, icon: Icon }) => (
          <Link key={key} href={`/dashboard/agriculture/stock-management?category=${key}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="pt-4 text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                  <Icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{categoryTotals[key] ?? 0}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Alerts */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" /> Active Alerts
                {unreadAlerts.length > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{unreadAlerts.length}</span>}
              </CardTitle>
              <Link href="/dashboard/agriculture/stock-management">
                <Button variant="ghost" size="sm">View All <ChevronRight className="w-3 h-3 ml-1" /></Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {activeAlerts.slice(0, 4).map(alert => (
                <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${alert.severity === 'critical' ? 'bg-red-50 border-red-200' : alert.severity === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${alert.severity === 'critical' ? 'bg-red-500' : alert.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.message}</p>
                  </div>
                  <button onClick={() => handleDismiss(alert.id)} className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0">✕</button>
                </div>
              ))}
              {activeAlerts.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p className="text-sm">All clear — no active alerts</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Requests */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-green-600" /> Stock Requests
              </CardTitle>
              <Link href="/dashboard/agriculture/requests">
                <Button variant="ghost" size="sm">Manage <ChevronRight className="w-3 h-3 ml-1" /></Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {requests.slice(0, 3).map(req => (
                <div key={req.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/40 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{req.requestNumber}</p>
                      {req.priority === 'urgent' && <span className="bg-red-100 text-red-700 text-xs px-1.5 py-0 rounded-full">urgent</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{req.requestedByName} · {req.farmZone} · {req.items.length} item(s)</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${req.status === 'pending' ? 'bg-amber-100 text-amber-700' : req.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{req.status}</span>
                </div>
              ))}
              {requests.length === 0 && <p className="text-sm text-muted-foreground text-center py-3">No requests yet</p>}
            </CardContent>
          </Card>

          {/* Usage Trend */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" /> 6-Week Usage Trend
              </CardTitle>
              <Link href="/dashboard/agriculture/reports">
                <Button variant="ghost" size="sm">Full Report <ChevronRight className="w-3 h-3 ml-1" /></Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-1 items-end h-16 mt-2">
                {USAGE_HISTORY.map(w => {
                  const total = w.fungicide + w.insecticide + w.herbicide;
                  const maxTotal = Math.max(...USAGE_HISTORY.map(x => x.fungicide + x.insecticide + x.herbicide));
                  return (
                    <div key={w.week} className="flex-1 flex flex-col justify-end items-center gap-0.5" style={{ height: `${(total / maxTotal) * 56}px` }}>
                      <div className="w-full bg-blue-400" style={{ height: `${(w.fungicide / total) * 100}%` }} />
                      <div className="w-full bg-orange-400" style={{ height: `${(w.insecticide / total) * 100}%` }} />
                      <div className="w-full bg-yellow-400" style={{ height: `${(w.herbicide / total) * 100}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                {USAGE_HISTORY.map(w => <p key={w.week} className="text-xs text-muted-foreground flex-1 text-center">{w.week}</p>)}
              </div>
              <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                <span><span className="inline-block w-2 h-2 bg-blue-400 rounded-sm mr-1" />Fungicide</span>
                <span><span className="inline-block w-2 h-2 bg-orange-400 rounded-sm mr-1" />Insecticide</span>
                <span><span className="inline-block w-2 h-2 bg-yellow-400 rounded-sm mr-1" />Herbicide</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Equipment Out */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tractor className="w-4 h-4 text-slate-500" /> Equipment Out Today
              </CardTitle>
              <Link href="/dashboard/agriculture/equipment">
                <Button variant="ghost" size="sm" className="text-xs">View <ArrowRight className="w-3 h-3 ml-1" /></Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {checkouts.filter(e => !e.isReturned).slice(0, 4).map(e => (
                <div key={e.id} className={`p-2.5 rounded-lg border text-xs ${e.isOverdue ? 'bg-red-50 border-red-200' : 'bg-card'}`}>
                  <div className="flex justify-between"><span className="font-medium">{e.itemName}</span>{e.isOverdue && <span className="text-red-600 font-semibold">OVERDUE</span>}</div>
                  <p className="text-muted-foreground">{e.checkoutBy} · {e.farmZone}</p>
                </div>
              ))}
              {checkouts.filter(e => !e.isReturned).length === 0 && <p className="text-xs text-muted-foreground text-center py-2">All equipment returned</p>}
            </CardContent>
          </Card>

          {/* Active Plans */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-blue-500" /> Active Plans
                {plansWithShortfall.length > 0 && <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{plansWithShortfall.length}</span>}
              </CardTitle>
              <Link href="/dashboard/agriculture/planner">
                <Button variant="ghost" size="sm" className="text-xs">Manage <ArrowRight className="w-3 h-3 ml-1" /></Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {activePlans.slice(0, 2).map(plan => {
                const shortfallItems = plan.items.filter(i => !i.isStockSufficient);
                const progress = plan.totalApplications > 0 ? Math.round((plan.completedApplications / plan.totalApplications) * 100) : 0;
                return (
                  <div key={plan.id} className="p-3 rounded-lg border text-xs space-y-2">
                    <div className="flex justify-between items-start">
                      <div><p className="font-medium text-sm leading-tight">{plan.planName}</p><p className="text-muted-foreground">{plan.farmZone} · {plan.cycle}</p></div>
                      {shortfallItems.length > 0 && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-muted-foreground">{plan.completedApplications}/{plan.totalApplications} applications</p>
                  </div>
                );
              })}
              {activePlans.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No active plans</p>}
            </CardContent>
          </Card>

          {/* Today Packing */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-sm flex items-center gap-2"><Boxes className="w-4 h-4 text-blue-500" /> Packing Today</CardTitle>
              <Link href="/dashboard/agriculture/packing-station"><Button variant="ghost" size="sm" className="text-xs">Station <ArrowRight className="w-3 h-3 ml-1" /></Button></Link>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {todayPacking.map(rec => {
                const pct = rec.targetBoxes > 0 ? Math.round((rec.packedBoxes / rec.targetBoxes) * 100) : 100;
                return (
                  <div key={rec.id} className="text-xs space-y-1.5">
                    <div className="flex justify-between"><span className="font-medium">{rec.stationName}</span><span className="text-muted-foreground">{rec.produce}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>{rec.packedBoxes}/{rec.targetBoxes} boxes</span><span className={pct >= 90 ? 'text-green-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600'}>{pct}%</span></div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
              {todayPacking.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No packing records today</p>}
              <div className="pt-2 border-t flex justify-between text-xs font-semibold"><span>Total Today</span><span className="text-blue-600">{totalPackedToday} boxes</span></div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="py-4"><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-1">
              {[
                { label: 'Log Chemical Usage', href: '/dashboard/agriculture/usage-tracker', icon: FlaskConical },
                { label: 'Request Stock', href: '/dashboard/agriculture/requests', icon: ShoppingCart },
                { label: 'Checkout Equipment', href: '/dashboard/agriculture/equipment', icon: Tractor },
                { label: 'Record Packing', href: '/dashboard/agriculture/packing-station', icon: Boxes },
                { label: 'Generate Report', href: '/dashboard/agriculture/reports', icon: BarChart3 },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href}>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors cursor-pointer group">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{label}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
