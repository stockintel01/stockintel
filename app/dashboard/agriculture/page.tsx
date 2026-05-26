'use client';

import { useState } from 'react';
import {
  Package, AlertTriangle, CheckCircle2, Clock, TrendingUp,
  Leaf, FlaskConical, Bug, Sprout, Tractor, ArrowRight,
  Bell, ChevronRight, BarChart3, ShoppingCart, Users,
  AlertCircle, RefreshCw, Boxes
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  MOCK_AGRIC_INVENTORY, MOCK_AGRIC_ALERTS, MOCK_STOCK_REQUESTS,
  MOCK_EQUIPMENT_CHECKOUTS, MOCK_PACKING_RECORDS, MOCK_SPRAY_PLANS,
  USAGE_HISTORY
} from '@/lib/agric/mock-data';

const CATEGORY_COLORS: Record<string, string> = {
  fungicide: 'bg-blue-100 text-blue-800 border-blue-200',
  insecticide: 'bg-orange-100 text-orange-800 border-orange-200',
  herbicide: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  fertilizer: 'bg-green-100 text-green-800 border-green-200',
  equipment: 'bg-slate-100 text-slate-800 border-slate-200',
  seed: 'bg-purple-100 text-purple-800 border-purple-200',
};

function getStockStatus(item: typeof MOCK_AGRIC_INVENTORY[0]) {
  if (item.currentStock === 0) return { label: 'Out of Stock', color: 'text-red-600 bg-red-50', dot: 'bg-red-500' };
  if (item.currentStock <= item.minimumStock * 0.5) return { label: 'Critical', color: 'text-red-600 bg-red-50', dot: 'bg-red-500' };
  if (item.currentStock <= item.minimumStock) return { label: 'Low Stock', color: 'text-amber-600 bg-amber-50', dot: 'bg-amber-500' };
  return { label: 'In Stock', color: 'text-green-600 bg-green-50', dot: 'bg-green-500' };
}

export default function AgricOverviewPage() {
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const activeAlerts = MOCK_AGRIC_ALERTS.filter(a => !dismissedAlerts.includes(a.id));
  const unreadAlerts = activeAlerts.filter(a => !a.isRead);

  const criticalItems = MOCK_AGRIC_INVENTORY.filter(i => i.currentStock <= i.minimumStock * 0.5 && i.isActive);
  const lowItems = MOCK_AGRIC_INVENTORY.filter(i => i.currentStock > i.minimumStock * 0.5 && i.currentStock <= i.minimumStock && i.isActive);
  const pendingRequests = MOCK_STOCK_REQUESTS.filter(r => r.status === 'pending');
  const overdueEquipment = MOCK_EQUIPMENT_CHECKOUTS.filter(e => e.isOverdue && !e.isReturned);

  const todayPacking = MOCK_PACKING_RECORDS.filter(r => r.date === new Date().toISOString().slice(0, 10));
  const totalPackedToday = todayPacking.reduce((s, r) => s + r.packedBoxes, 0);
  const totalTargetToday = todayPacking.reduce((s, r) => s + r.targetBoxes, 0);

  const categoryTotals = {
    fungicide: MOCK_AGRIC_INVENTORY.filter(i => i.category === 'fungicide' && i.isActive).length,
    insecticide: MOCK_AGRIC_INVENTORY.filter(i => i.category === 'insecticide' && i.isActive).length,
    herbicide: MOCK_AGRIC_INVENTORY.filter(i => i.category === 'herbicide' && i.isActive).length,
    fertilizer: MOCK_AGRIC_INVENTORY.filter(i => i.category === 'fertilizer' && i.isActive).length,
    equipment: MOCK_AGRIC_INVENTORY.filter(i => i.category === 'equipment' && i.isActive).length,
    seed: MOCK_AGRIC_INVENTORY.filter(i => i.category === 'seed' && i.isActive).length,
  };

  const activePlans = MOCK_SPRAY_PLANS.filter(p => p.status === 'active');
  const plansWithShortfall = MOCK_SPRAY_PLANS.filter(p => p.items.some(i => !i.isStockSufficient));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Leaf className="w-8 h-8 text-green-600" />
            Farm Operations Overview
          </h1>
          <p className="text-muted-foreground mt-1">
            Moonlight Fresco Ltd — {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/agriculture/reports">
            <Button variant="outline" size="sm">
              <BarChart3 className="w-4 h-4 mr-2" /> Reports
            </Button>
          </Link>
          <Link href="/dashboard/agriculture/requests">
            <Button size="sm" className="bg-green-600 hover:bg-green-700">
              <ShoppingCart className="w-4 h-4 mr-2" /> New Request
            </Button>
          </Link>
        </div>
      </div>

      {/* Critical Alerts Banner */}
      {unreadAlerts.filter(a => a.severity === 'critical').length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red-800">
              {unreadAlerts.filter(a => a.severity === 'critical').length} Critical Alert{unreadAlerts.filter(a => a.severity === 'critical').length > 1 ? 's' : ''} Require Attention
            </p>
            <div className="mt-1 space-y-1">
              {unreadAlerts.filter(a => a.severity === 'critical').map(alert => (
                <p key={alert.id} className="text-sm text-red-700">{alert.message}</p>
              ))}
            </div>
          </div>
          <Link href="/dashboard/agriculture/stock-management">
            <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">View</Button>
          </Link>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Items</p>
                <p className="text-3xl font-bold text-green-700">{MOCK_AGRIC_INVENTORY.filter(i => i.isActive).length}</p>
                <p className="text-xs text-muted-foreground mt-1">Active SKUs</p>
              </div>
              <Boxes className="w-10 h-10 text-green-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Low / Critical</p>
                <p className="text-3xl font-bold text-red-600">{criticalItems.length + lowItems.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{criticalItems.length} critical, {lowItems.length} low</p>
              </div>
              <AlertTriangle className="w-10 h-10 text-red-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending Requests</p>
                <p className="text-3xl font-bold text-amber-600">{pendingRequests.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Awaiting dispatch</p>
              </div>
              <RefreshCw className="w-10 h-10 text-amber-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Packed Today</p>
                <p className="text-3xl font-bold text-blue-600">{totalPackedToday}</p>
                <p className="text-xs text-muted-foreground mt-1">of {totalTargetToday} target boxes</p>
              </div>
              <Boxes className="w-10 h-10 text-blue-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { key: 'fungicide', label: 'Fungicides', icon: FlaskConical, color: 'blue' },
          { key: 'insecticide', label: 'Insecticides', icon: Bug, color: 'orange' },
          { key: 'herbicide', label: 'Herbicides', icon: Leaf, color: 'yellow' },
          { key: 'fertilizer', label: 'Fertilizers', icon: Sprout, color: 'green' },
          { key: 'equipment', label: 'Equipment', icon: Tractor, color: 'slate' },
          { key: 'seed', label: 'Seeds', icon: Package, color: 'purple' },
        ].map(({ key, label, icon: Icon, color }) => (
          <Link key={key} href={`/dashboard/agriculture/stock-management?category=${key}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="pt-4 text-center">
                <div className={`w-10 h-10 rounded-full bg-${color}-100 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-5 h-5 text-${color}-600`} />
                </div>
                <p className="text-2xl font-bold">{categoryTotals[key as keyof typeof categoryTotals]}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid md:grid-cols-3 gap-6">

        {/* Left: Alerts & Requests */}
        <div className="md:col-span-2 space-y-6">

          {/* Active Alerts */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" />
                Active Alerts
                {unreadAlerts.length > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{unreadAlerts.length}</span>
                )}
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
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{alert.message}</p>
                  </div>
                  <button onClick={() => setDismissedAlerts(prev => [...prev, alert.id])} className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0">✕</button>
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

          {/* Pending Stock Requests */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-green-600" />
                Stock Requests
              </CardTitle>
              <Link href="/dashboard/agriculture/requests">
                <Button variant="ghost" size="sm">Manage <ChevronRight className="w-3 h-3 ml-1" /></Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {MOCK_STOCK_REQUESTS.slice(0, 3).map(req => (
                <div key={req.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/40 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{req.requestNumber}</p>
                      <Badge className={`text-xs px-1.5 py-0 ${req.priority === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                        {req.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{req.requestedByName} · {req.farmZone} · {req.items.length} item{req.items.length > 1 ? 's' : ''}</p>
                  </div>
                  <Badge className={`text-xs ${req.status === 'pending' ? 'bg-amber-100 text-amber-700' : req.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {req.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Weekly Usage Chart (simple bar) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                6-Week Usage Trend
              </CardTitle>
              <Link href="/dashboard/agriculture/reports">
                <Button variant="ghost" size="sm">Full Report <ChevronRight className="w-3 h-3 ml-1" /></Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {['fungicide', 'insecticide', 'herbicide'].map(cat => {
                  const maxVal = Math.max(...USAGE_HISTORY.map(w => w[cat as keyof typeof w] as number));
                  const lastVal = USAGE_HISTORY[USAGE_HISTORY.length - 1][cat as keyof typeof USAGE_HISTORY[0]] as number;
                  const prevVal = USAGE_HISTORY[USAGE_HISTORY.length - 2][cat as keyof typeof USAGE_HISTORY[0]] as number;
                  const pct = (lastVal / maxVal) * 100;
                  const trend = lastVal >= prevVal;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize text-muted-foreground">{cat}</span>
                        <span className={`font-medium ${trend ? 'text-red-500' : 'text-green-500'}`}>
                          {trend ? '↑' : '↓'} {lastVal} units/wk
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${cat === 'fungicide' ? 'bg-blue-500' : cat === 'insecticide' ? 'bg-orange-500' : 'bg-yellow-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-4">
                {USAGE_HISTORY.map(w => (
                  <div key={w.week} className="flex-1 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      {['fungicide', 'insecticide', 'herbicide'].map((cat, ci) => (
                        <div key={cat} className={`w-full rounded-sm ${ci === 0 ? 'bg-blue-400' : ci === 1 ? 'bg-orange-400' : 'bg-yellow-400'}`}
                          style={{ height: `${((w[cat as keyof typeof w] as number) / 60) * 40}px` }} />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{w.week}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Quick Panels */}
        <div className="space-y-4">
          {/* Equipment Checkouts */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tractor className="w-4 h-4 text-slate-500" />
                Equipment Out Today
              </CardTitle>
              <Link href="/dashboard/agriculture/equipment">
                <Button variant="ghost" size="sm" className="text-xs">View <ArrowRight className="w-3 h-3 ml-1" /></Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {MOCK_EQUIPMENT_CHECKOUTS.filter(e => !e.isReturned).map(e => (
                <div key={e.id} className={`p-2.5 rounded-lg border text-xs ${e.isOverdue ? 'bg-red-50 border-red-200' : 'bg-card border-border'}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{e.itemName}</span>
                    {e.isOverdue && <span className="text-red-600 font-semibold">OVERDUE</span>}
                  </div>
                  <p className="text-muted-foreground">{e.checkoutBy} · {e.farmZone}</p>
                  <p className="text-muted-foreground">{new Date(e.checkoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              ))}
              {MOCK_EQUIPMENT_CHECKOUTS.filter(e => e.isReturned).slice(0, 1).map(e => (
                <div key={e.id} className="p-2.5 rounded-lg border bg-green-50 border-green-200 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{e.itemName}</span>
                    <span className="text-green-600">✓ Returned</span>
                  </div>
                  <p className="text-muted-foreground">{e.checkoutBy} · {e.farmZone}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Active Spray Plans */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-blue-500" />
                Active Plans
                {plansWithShortfall.length > 0 && <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{plansWithShortfall.length}</span>}
              </CardTitle>
              <Link href="/dashboard/agriculture/planner">
                <Button variant="ghost" size="sm" className="text-xs">Manage <ArrowRight className="w-3 h-3 ml-1" /></Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {activePlans.map(plan => {
                const shortfallItems = plan.items.filter(i => !i.isStockSufficient);
                const progress = plan.totalApplications > 0 ? Math.round((plan.completedApplications / plan.totalApplications) * 100) : 0;
                return (
                  <div key={plan.id} className="p-3 rounded-lg border text-xs space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm leading-tight">{plan.planName}</p>
                        <p className="text-muted-foreground">{plan.farmZone} · {plan.cycle}</p>
                      </div>
                      {shortfallItems.length > 0 && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span>{plan.completedApplications}/{plan.totalApplications}</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    {shortfallItems.length > 0 && (
                      <p className="text-amber-700 bg-amber-50 rounded p-1.5">
                        ⚠ Stock shortfall: {shortfallItems.map(i => i.itemName).join(', ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Today's Packing */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Boxes className="w-4 h-4 text-blue-500" />
                Packing Today
              </CardTitle>
              <Link href="/dashboard/agriculture/packing-station">
                <Button variant="ghost" size="sm" className="text-xs">Station <ArrowRight className="w-3 h-3 ml-1" /></Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {todayPacking.length > 0 ? todayPacking.map(rec => {
                const pct = totalTargetToday > 0 ? Math.round((rec.packedBoxes / rec.targetBoxes) * 100) : 0;
                return (
                  <div key={rec.id} className="text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-medium">{rec.stationName}</span>
                      <span className="text-muted-foreground">{rec.produce}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{rec.packedBoxes} / {rec.targetBoxes} boxes</span>
                      <span className={pct >= 90 ? 'text-green-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600'}>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              }) : (
                <p className="text-xs text-muted-foreground text-center py-2">No packing records today</p>
              )}
              <div className="pt-2 border-t">
                <div className="flex justify-between text-xs font-semibold">
                  <span>Total Today</span>
                  <span className="text-blue-600">{totalPackedToday} boxes</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {[
                { label: 'Log Chemical Usage', href: '/dashboard/agriculture/usage-tracker', icon: FlaskConical, color: 'text-blue-600' },
                { label: 'Request Stock', href: '/dashboard/agriculture/requests', icon: ShoppingCart, color: 'text-green-600' },
                { label: 'Checkout Equipment', href: '/dashboard/agriculture/equipment', icon: Tractor, color: 'text-slate-600' },
                { label: 'Record Packing', href: '/dashboard/agriculture/packing-station', icon: Boxes, color: 'text-purple-600' },
                { label: 'Generate Report', href: '/dashboard/agriculture/reports', icon: BarChart3, color: 'text-orange-600' },
                { label: 'Manage Team', href: '/dashboard/team', icon: Users, color: 'text-indigo-600' },
              ].map(({ label, href, icon: Icon, color }) => (
                <Link key={href} href={href}>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors cursor-pointer group">
                    <Icon className={`w-4 h-4 ${color}`} />
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
