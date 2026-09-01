'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  Bug,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  CloudLightning,
  CloudRain,
  Clock3,
  Droplets,
  FlaskConical,
  Leaf,
  MapPin,
  Package,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sprout,
  Sun,
  Tractor,
  TrendingUp,
  Truck,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { CriticalAlertPanel } from '@/components/agriculture/CriticalAlertPanel';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { roleLabel, userHasAccess } from '@/lib/access-permissions';
import { getAgricultureProfile, type FarmLocation } from '@/lib/agric/config';
import {
  buildPackingFulfilmentOccurrences,
  calculatePackingDailyMetrics,
  packingCalendarDate,
  packingDateOffset,
} from '@/lib/agric/packing';
import { useAgric } from '@/lib/agric/useAgric';
import { getRecentFarmWeeks } from '@/lib/agric/week';
import { useAppStore } from '@/lib/store';

interface CurrentWeather {
  temperature_2m: number;
  weather_code: number;
  wind_speed_10m: number;
  precipitation: number;
  relative_humidity_2m: number;
}

interface OverviewStat {
  label: string;
  value: number | string;
  detail: string;
  href: string;
  icon: LucideIcon;
  tone: string;
}

interface PriorityItem {
  label: string;
  detail: string;
  href: string;
  icon: LucideIcon;
  tone: string;
  rank: number;
}

function WeatherBanner({ location, canConfigure }: { location?: FarmLocation; canConfigure: boolean }) {
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  const locationKey = latitude !== undefined && longitude !== undefined ? `${latitude},${longitude}` : '';
  const [result, setResult] = useState<{ locationKey: string; weather: CurrentWeather | null; unavailable: boolean }>({ locationKey: '', weather: null, unavailable: false });

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;
    const controller = new AbortController();
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m,precipitation,relative_humidity_2m&timezone=auto`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Weather service unavailable');
        return response.json() as Promise<{ current?: CurrentWeather }>;
      })
      .then(data => {
        setResult({ locationKey, weather: data.current ?? null, unavailable: !data.current });
      })
      .catch(error => {
        if ((error as Error).name !== 'AbortError') setResult({ locationKey, weather: null, unavailable: true });
      });
    return () => controller.abort();
  }, [latitude, locationKey, longitude]);

  if (!location) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-semibold text-amber-950">Farm location is not configured</p>
            <p className="text-xs leading-5 text-amber-800">Weather and spray advice will remain unavailable until the organization records its actual farm location.</p>
          </div>
        </div>
        {canConfigure ? <Link href="/dashboard/settings" className={buttonVariants({ size: 'sm', variant: 'outline', className: 'border-amber-300 bg-white' })}><Settings2 className="mr-2 h-4 w-4" />Set location</Link> : <span className="text-xs font-medium text-amber-800">Ask an owner or manager to update Farm Settings.</span>}
      </div>
    );
  }

  if (result.locationKey === locationKey && result.unavailable) {
    return (
      <Link href="/dashboard/agriculture/weather" className="block rounded-xl border bg-card px-4 py-3 hover:bg-accent/40">
        <div className="flex items-center gap-3"><Cloud className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm font-semibold">Weather is temporarily unavailable</p><p className="text-xs text-muted-foreground">Open Weather and Irrigation to retry or continue with recorded rainfall data.</p></div></div>
      </Link>
    );
  }

  const weather = result.locationKey === locationKey ? result.weather : null;
  if (!weather) return <div className="h-[70px] animate-pulse rounded-xl border bg-muted/60" aria-label="Loading farm weather" />;

  const isRaining = weather.weather_code >= 51;
  const isStorm = weather.weather_code >= 95;
  const windHigh = weather.wind_speed_10m > 20;
  const advice = isStorm
    ? { label: 'Thunderstorm: do not spray', tone: 'border-red-200 bg-red-50 text-red-800' }
    : isRaining
      ? { label: 'Rain detected: hold spray operations', tone: 'border-red-200 bg-red-50 text-red-800' }
      : windHigh
        ? { label: 'High wind: avoid spraying', tone: 'border-amber-200 bg-amber-50 text-amber-800' }
        : { label: 'Conditions currently support spraying', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  const WeatherIcon = isStorm ? CloudLightning : isRaining ? CloudRain : weather.weather_code <= 1 ? Sun : Cloud;

  return (
    <Link href="/dashboard/agriculture/weather" className={`block rounded-xl border px-4 py-3 transition-shadow hover:shadow-sm ${advice.tone}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <WeatherIcon className="h-6 w-6 shrink-0 text-blue-600" />
          <div><p className="text-sm font-semibold">{weather.temperature_2m.toFixed(1)} C at {location.name}</p><p className="text-xs font-medium">{advice.label}</p></div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1"><Droplets className="h-3.5 w-3.5" />{weather.relative_humidity_2m}% humidity</span>
          <span className="flex items-center gap-1"><Wind className="h-3.5 w-3.5" />{weather.wind_speed_10m.toFixed(0)} km/h</span>
          <ChevronRight className="hidden h-4 w-4 sm:block" />
        </div>
      </div>
    </Link>
  );
}

function OverviewStatCard({ stat }: { stat: OverviewStat }) {
  const Icon = stat.icon;
  return (
    <Link href={stat.href} className="group block">
      <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-medium text-muted-foreground">{stat.label}</p><p className="mt-1 text-3xl font-bold tracking-tight">{stat.value}</p></div>
            <div className={`rounded-xl p-2.5 ${stat.tone}`}><Icon className="h-5 w-5" /></div>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{stat.detail}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AgricOverviewPage() {
  const agric = useAgric();
  const { user, organization } = useAppStore();
  const profile = getAgricultureProfile(organization?.settings);
  const today = packingCalendarDate();
  const canStock = userHasAccess(user, 'agricStock');
  const canRequests = userHasAccess(user, 'agricRequests');
  const canUsage = userHasAccess(user, 'agricUsage');
  const canPlanner = userHasAccess(user, 'agricPlanner');
  const canEquipment = userHasAccess(user, 'agricEquipment');
  const canPacking = userHasAccess(user, 'agricPacking');
  const canReports = userHasAccess(user, 'agricReports');
  const canWeather = userHasAccess(user, 'agricWeather');
  const canCrops = userHasAccess(user, 'agricCrops');
  const canScouting = userHasAccess(user, 'agricSigatoka');
  const canSettings = userHasAccess(user, 'settings');
  const canViewPackingSummary = canPacking || canReports;

  const usageHistory = useMemo(() => getRecentFarmWeeks(new Date(), 6, profile.weekStartsOn).map(period => {
    const logs = agric.usageLogs.filter(log => log.weekNumber === period.week && (!log.weekYear || log.weekYear === period.year));
    const total = (category: string) => logs.filter(log => log.category === category).reduce((sum, log) => sum + log.quantity, 0);
    return { week: `W${period.week}`, fungicide: total('fungicide'), insecticide: total('insecticide'), herbicide: total('herbicide') };
  }), [agric.usageLogs, profile.weekStartsOn]);

  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const visibleAlerts = agric.alerts.filter(alert => {
    if (dismissedAlerts.includes(alert.id)) return false;
    if (['low_stock', 'restock_needed', 'adjustment_pending', 'deletion_log', 'restock_request'].includes(alert.type)) return canStock;
    if (alert.type === 'equipment_overdue') return canEquipment;
    if (alert.type === 'plan_shortfall') return canPlanner;
    return false;
  });
  const unreadAlerts = visibleAlerts.filter(alert => !alert.isRead);
  const criticalAlerts = unreadAlerts.filter(alert => alert.severity === 'critical');
  const criticalItems = agric.inventory.filter(item => item.isActive && item.currentStock <= item.minimumStock * 0.5);
  const lowItems = agric.inventory.filter(item => item.isActive && item.currentStock > item.minimumStock * 0.5 && item.currentStock <= item.minimumStock);
  const pendingRequests = agric.requests.filter(request => request.status === 'pending');
  const urgentRequests = pendingRequests.filter(request => request.priority === 'urgent');
  const equipmentOut = agric.checkouts.filter(checkout => !checkout.isReturned);
  const overdueEquipment = equipmentOut.filter(checkout => checkout.isOverdue);
  const activePlans = agric.plans.filter(plan => plan.status === 'active');
  const plansWithShortfall = activePlans.filter(plan => plan.items.some(item => !item.isStockSufficient));

  const todayPacking = agric.packingRecords.filter(record => record.date === today);
  const packingOccurrences = useMemo(() => buildPackingFulfilmentOccurrences(
    agric.packingPlans,
    agric.packingRecords,
    agric.shippingRecords,
    packingDateOffset(today, -30),
    packingDateOffset(today, 14),
    today,
  ), [agric.packingPlans, agric.packingRecords, agric.shippingRecords, today]);
  const packingMetrics = calculatePackingDailyMetrics(today, packingOccurrences, agric.packingRecords, agric.shippingRecords);
  const openPackingWork = packingOccurrences.filter(item => item.status !== 'completed' && item.occurrenceDate <= packingDateOffset(today, 14));
  const overduePackingWork = openPackingWork.filter(item => item.status === 'overdue');
  const readyToShip = openPackingWork.filter(item => item.status === 'ready_to_ship');
  const awaitingInspectionBoxes = todayPacking.reduce((sum, record) => sum + Math.max(0, record.packedBoxes - (record.inspectedBoxes ?? 0)), 0);
  const reworkBoxes = todayPacking.reduce((sum, record) => sum + Math.max(0, record.reworkBoxes ?? 0), 0);
  const inspectedLots = agric.packingRecords.filter(record => (record.inspectedBoxes ?? 0) > 0);
  const standardLinkedLots = inspectedLots.filter(record => Boolean(record.qualityStandardReference));
  const missingStandardLots = inspectedLots.filter(record => !record.qualityStandardReference);
  const standardsCoverage = inspectedLots.length ? Math.round(standardLinkedLots.length / inspectedLots.length * 100) : null;
  const localPackedToday = todayPacking.filter(record => record.market === 'local').reduce((sum, record) => sum + record.packedBoxes, 0);
  const exportPackedToday = todayPacking.filter(record => record.market === 'export').reduce((sum, record) => sum + record.packedBoxes, 0);
  const exportDestinations = Array.from(new Set(todayPacking.filter(record => record.market === 'export' && record.destinationCountry).map(record => record.destinationCountry as string)));

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const category of ['fungicide', 'insecticide', 'herbicide', 'fertilizer', 'equipment', 'seed']) {
      totals[category] = agric.inventory.filter(item => item.category === category && item.isActive).length;
    }
    return totals;
  }, [agric.inventory]);

  const stats: OverviewStat[] = [
    ...(canStock ? [{ label: 'Active stock items', value: agric.inventory.filter(item => item.isActive).length, detail: `${criticalItems.length + lowItems.length} need stock attention`, href: '/dashboard/agriculture/stock-management', icon: Package, tone: 'bg-emerald-50 text-emerald-700' }] : []),
    ...(canRequests ? [{ label: 'Pending requests', value: pendingRequests.length, detail: urgentRequests.length ? `${urgentRequests.length} marked urgent` : 'No urgent requests waiting', href: '/dashboard/agriculture/requests', icon: ShoppingCart, tone: 'bg-amber-50 text-amber-700' }] : []),
    ...(canEquipment ? [{ label: 'Equipment out', value: equipmentOut.length, detail: overdueEquipment.length ? `${overdueEquipment.length} overdue for return` : 'No overdue returns', href: '/dashboard/agriculture/equipment', icon: Tractor, tone: 'bg-slate-100 text-slate-700' }] : []),
    ...(canViewPackingSummary ? [{ label: 'Packed today', value: packingMetrics.packedBoxes, detail: packingMetrics.targetBoxes ? `${packingMetrics.acceptedPackedBoxes} accepted of ${packingMetrics.targetBoxes} target boxes` : `${packingMetrics.acceptedPackedBoxes} boxes quality accepted`, href: canPacking ? '/dashboard/agriculture/packing-station' : '/dashboard/agriculture/reports', icon: Boxes, tone: 'bg-blue-50 text-blue-700' }] : []),
    ...(canPlanner ? [{ label: 'Active spray plans', value: activePlans.length, detail: plansWithShortfall.length ? `${plansWithShortfall.length} have material shortfalls` : 'Materials currently sufficient', href: '/dashboard/agriculture/planner', icon: FlaskConical, tone: 'bg-violet-50 text-violet-700' }] : []),
  ];

  const priorities: PriorityItem[] = [
    ...(canStock && criticalItems.length ? [{ label: 'Restock critical inventory', detail: `${criticalItems.length} item${criticalItems.length === 1 ? '' : 's'} at or below half of minimum stock`, href: '/dashboard/agriculture/stock-management', icon: AlertTriangle, tone: 'text-red-700 bg-red-50', rank: 1 }] : []),
    ...(canEquipment && overdueEquipment.length ? [{ label: 'Recover overdue equipment', detail: `${overdueEquipment.length} checkout${overdueEquipment.length === 1 ? '' : 's'} passed the expected return time`, href: '/dashboard/agriculture/equipment', icon: Clock3, tone: 'text-red-700 bg-red-50', rank: 2 }] : []),
    ...(canPacking && overduePackingWork.length ? [{ label: 'Resolve overdue packing targets', detail: `${overduePackingWork.length} fulfilment${overduePackingWork.length === 1 ? '' : 's'} still open`, href: '/dashboard/agriculture/packing-station', icon: Boxes, tone: 'text-red-700 bg-red-50', rank: 3 }] : []),
    ...(canRequests && urgentRequests.length ? [{ label: 'Review urgent stock requests', detail: `${urgentRequests.length} urgent request${urgentRequests.length === 1 ? '' : 's'} awaiting action`, href: '/dashboard/agriculture/requests', icon: ShoppingCart, tone: 'text-amber-700 bg-amber-50', rank: 4 }] : []),
    ...(canPlanner && plansWithShortfall.length ? [{ label: 'Fund plan material shortfalls', detail: `${plansWithShortfall.length} active plan${plansWithShortfall.length === 1 ? '' : 's'} cannot be fully executed from current stock`, href: '/dashboard/agriculture/planner', icon: FlaskConical, tone: 'text-amber-700 bg-amber-50', rank: 5 }] : []),
    ...(canPacking && (awaitingInspectionBoxes > 0 || reworkBoxes > 0) ? [{ label: 'Complete packhouse quality work', detail: `${awaitingInspectionBoxes} boxes await inspection and ${reworkBoxes} require rework`, href: '/dashboard/agriculture/packing-station', icon: ClipboardCheck, tone: 'text-blue-700 bg-blue-50', rank: 6 }] : []),
    ...(canPacking && readyToShip.length ? [{ label: 'Dispatch accepted produce', detail: `${readyToShip.length} fulfilment${readyToShip.length === 1 ? '' : 's'} ready to ship`, href: '/dashboard/agriculture/packing-station', icon: Truck, tone: 'text-violet-700 bg-violet-50', rank: 7 }] : []),
  ].sort((left, right) => left.rank - right.rank);

  const quickActions = [
    ...(canRequests ? [{ label: 'Request stock', href: '/dashboard/agriculture/requests', icon: ShoppingCart }] : []),
    ...(canUsage ? [{ label: 'Log input usage', href: '/dashboard/agriculture/usage-tracker', icon: FlaskConical }] : []),
    ...(canPacking ? [{ label: 'Open packhouse queue', href: '/dashboard/agriculture/packing-station', icon: Boxes }] : []),
    ...(canScouting ? [{ label: 'Record disease scouting', href: '/dashboard/agriculture/sigatoka', icon: Bug }] : []),
    ...(canEquipment ? [{ label: 'Checkout equipment', href: '/dashboard/agriculture/equipment', icon: Tractor }] : []),
    ...(canCrops ? [{ label: 'Open crop records', href: '/dashboard/agriculture/crops', icon: Sprout }] : []),
    ...(canReports ? [{ label: 'Generate report', href: '/dashboard/agriculture/reports', icon: BarChart3 }] : []),
  ];

  async function handleDismiss(alertId: string) {
    setDismissedAlerts(previous => [...previous, alertId]);
    await agric.readAlert(alertId);
  }

  if (agric.loading) {
    return <div className="space-y-4 animate-pulse" aria-label="Loading farm overview">{[1, 2, 3, 4].map(item => <div key={item} className="h-24 rounded-xl bg-muted" />)}</div>;
  }

  const PrimaryActionIcon = quickActions[0]?.icon;

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700"><Leaf className="h-4 w-4" />Farm operations</div>
          <h1 className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-3xl">{organization?.name || 'Agriculture Workspace'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}{user ? ` | ${roleLabel(user.role)}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReports ? <Link href="/dashboard/agriculture/reports" className={buttonVariants({ variant: 'outline', size: 'sm' })}><BarChart3 className="mr-2 h-4 w-4" />Reports</Link> : null}
          {quickActions[0] && PrimaryActionIcon ? <Link href={quickActions[0].href} className={buttonVariants({ size: 'sm', className: 'bg-emerald-700 hover:bg-emerald-800' })}><PrimaryActionIcon className="mr-2 h-4 w-4" />{quickActions[0].label}</Link> : null}
        </div>
      </header>

      {agric.error ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Some overview data could not be loaded. Check connectivity and your assigned access.</div> : null}
      {canWeather ? <WeatherBanner location={profile.location} canConfigure={canSettings} /> : null}
      <CriticalAlertPanel alerts={criticalAlerts} onMarkReviewed={handleDismiss} />

      {stats.length ? <section aria-label="Operational summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.slice(0, 4).map(stat => <OverviewStatCard key={stat.label} stat={stat} />)}</section> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
              <div><CardTitle className="text-base">Work requiring attention</CardTitle><p className="mt-1 text-xs text-muted-foreground">Prioritized from the modules assigned to your role.</p></div>
              {priorities.length ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">{priorities.length} open</span> : null}
            </CardHeader>
            <CardContent className="space-y-2">
              {priorities.slice(0, 5).map(priority => {
                const Icon = priority.icon;
                return <Link key={`${priority.href}-${priority.label}`} href={priority.href} className="group flex items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-accent/40"><div className={`rounded-lg p-2 ${priority.tone}`}><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{priority.label}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{priority.detail}</p></div><ChevronRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>;
              })}
              {!priorities.length ? <div className="py-8 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" /><p className="mt-2 text-sm font-semibold">No urgent work in your assigned modules</p><p className="mt-1 text-xs text-muted-foreground">New alerts and scheduled activities will appear here.</p></div> : null}
            </CardContent>
          </Card>

          {canStock ? <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 pb-3"><CardTitle className="text-base">Stock by category</CardTitle><Link href="/dashboard/agriculture/stock-management" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Manage stock<ChevronRight className="ml-1 h-4 w-4" /></Link></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { key: 'fungicide', label: 'Fungicides', icon: FlaskConical },
                { key: 'insecticide', label: 'Insecticides', icon: Bug },
                { key: 'herbicide', label: 'Herbicides', icon: Leaf },
                { key: 'fertilizer', label: 'Fertilizers', icon: Sprout },
                { key: 'equipment', label: 'Equipment', icon: Tractor },
                { key: 'seed', label: 'Seeds', icon: Package },
              ].map(({ key, label, icon: Icon }) => <Link key={key} href={`/dashboard/agriculture/stock-management?category=${key}`} className="rounded-xl border p-3 text-center transition-colors hover:bg-accent/50"><Icon className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xl font-bold">{categoryTotals[key] ?? 0}</p><p className="text-xs text-muted-foreground">{label}</p></Link>)}
            </CardContent>
          </Card> : null}

          {canRequests ? <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 pb-3"><CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-4 w-4 text-emerald-700" />Recent stock requests</CardTitle><Link href="/dashboard/agriculture/requests" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Open requests<ChevronRight className="ml-1 h-4 w-4" /></Link></CardHeader>
            <CardContent className="space-y-2">
              {agric.requests.slice(0, 4).map(request => <Link href="/dashboard/agriculture/requests" key={request.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors hover:bg-accent/40"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{request.requestNumber}</p>{request.priority === 'urgent' ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Urgent</span> : null}</div><p className="mt-0.5 truncate text-xs text-muted-foreground">{request.requestedByName} | {request.farmZone} | {request.items.length} item(s)</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${request.status === 'pending' ? 'bg-amber-100 text-amber-700' : request.status === 'received' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{request.status.replaceAll('_', ' ')}</span></Link>)}
              {!agric.requests.length ? <p className="py-6 text-center text-sm text-muted-foreground">No stock requests have been recorded.</p> : null}
            </CardContent>
          </Card> : null}

          {(canUsage || canReports) ? <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 pb-3"><div><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-blue-600" />Six-week input usage</CardTitle><p className="mt-1 text-xs text-muted-foreground">Recorded fungicide, insecticide and herbicide quantities by farm week.</p></div>{canReports ? <Link href="/dashboard/agriculture/reports" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Full report<ChevronRight className="ml-1 h-4 w-4" /></Link> : null}</CardHeader>
            <CardContent>
              <div className="flex h-28 items-end gap-2" aria-label="Six-week input usage chart">
                {usageHistory.map(week => {
                  const total = week.fungicide + week.insecticide + week.herbicide;
                  const maxTotal = Math.max(1, ...usageHistory.map(item => item.fungicide + item.insecticide + item.herbicide));
                  const height = total > 0 ? Math.max(8, total / maxTotal * 88) : 2;
                  return <div key={week.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><div className="flex w-full max-w-12 flex-col justify-end overflow-hidden rounded-t-md bg-muted" style={{ height }} title={`${week.week}: ${total} total`}><div className="w-full bg-blue-500" style={{ height: total ? `${week.fungicide / total * 100}%` : 0 }} /><div className="w-full bg-orange-400" style={{ height: total ? `${week.insecticide / total * 100}%` : 0 }} /><div className="w-full bg-yellow-400" style={{ height: total ? `${week.herbicide / total * 100}%` : 0 }} /></div><span className="text-[11px] text-muted-foreground">{week.week}</span></div>;
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-blue-500" />Fungicide</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-orange-400" />Insecticide</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-yellow-400" />Herbicide</span></div>
            </CardContent>
          </Card> : null}
        </div>

        <aside className="space-y-5">
          {canViewPackingSummary ? <Card className="overflow-hidden">
            <CardHeader className="border-b bg-slate-50/70 pb-4"><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><Boxes className="h-4 w-4 text-blue-700" />Packhouse today</CardTitle><p className="mt-1 text-xs text-muted-foreground">Fulfilment, quality and market readiness.</p></div>{standardsCoverage !== null ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${standardsCoverage === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{standardsCoverage}% standards linked</span> : null}</div></CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-blue-50 p-3"><p className="text-2xl font-bold text-blue-800">{packingMetrics.packedBoxes}</p><p className="text-xs text-blue-700">Packed boxes</p></div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-2xl font-bold text-emerald-800">{packingMetrics.acceptedPackedBoxes}</p><p className="text-xs text-emerald-700">Quality accepted</p></div>
                <div className="rounded-xl bg-amber-50 p-3"><p className="text-2xl font-bold text-amber-800">{awaitingInspectionBoxes}</p><p className="text-xs text-amber-700">Awaiting inspection</p></div>
                <div className="rounded-xl bg-violet-50 p-3"><p className="text-2xl font-bold text-violet-800">{packingMetrics.shippedBoxes}</p><p className="text-xs text-violet-700">Shipped boxes</p></div>
              </div>

              <div>
                <div className="flex justify-between text-xs"><span className="font-medium">Daily packing target</span><span>{packingMetrics.targetBoxes ? `${packingMetrics.packedBoxes} / ${packingMetrics.targetBoxes}` : 'No target scheduled'}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-blue-600" style={{ width: `${packingMetrics.targetBoxes ? Math.min(100, packingMetrics.packedBoxes / packingMetrics.targetBoxes * 100) : 0}%` }} /></div>
              </div>

              <div className="space-y-2 border-t pt-4 text-xs">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Local market packed</span><span className="font-semibold">{localPackedToday} boxes</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Export market packed</span><span className="font-semibold">{exportPackedToday} boxes</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Open fulfilments</span><span className="font-semibold">{openPackingWork.length}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Rework boxes</span><span className={reworkBoxes ? 'font-semibold text-red-700' : 'font-semibold'}>{reworkBoxes}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Inspected lots missing a standard</span><span className={missingStandardLots.length ? 'font-semibold text-red-700' : 'font-semibold text-emerald-700'}>{missingStandardLots.length}</span></div>
              </div>

              {exportDestinations.length ? <div><p className="text-xs font-medium">Today&apos;s export destinations</p><div className="mt-2 flex flex-wrap gap-1.5">{exportDestinations.map(destination => <span key={destination} className="rounded-full border bg-background px-2.5 py-1 text-xs">{destination}</span>)}</div></div> : null}
              <Link href={canPacking ? '/dashboard/agriculture/packing-station' : '/dashboard/agriculture/reports'} className={buttonVariants({ variant: 'outline', className: 'w-full' })}>{canPacking ? 'Open packhouse workspace' : 'Open packing report'}<ArrowRight className="ml-2 h-4 w-4" /></Link>
            </CardContent>
          </Card> : null}

          {canEquipment ? <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Tractor className="h-4 w-4 text-slate-600" />Equipment in use</CardTitle><Link href="/dashboard/agriculture/equipment" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>View</Link></CardHeader>
            <CardContent className="space-y-2">{equipmentOut.slice(0, 4).map(checkout => <div key={checkout.id} className={`rounded-lg border p-2.5 text-xs ${checkout.isOverdue ? 'border-red-200 bg-red-50' : ''}`}><div className="flex justify-between gap-2"><span className="font-semibold">{checkout.itemName}</span>{checkout.isOverdue ? <span className="font-semibold text-red-700">Overdue</span> : null}</div><p className="mt-0.5 text-muted-foreground">{checkout.checkoutBy} | {checkout.farmZone}</p></div>)}{!equipmentOut.length ? <p className="py-3 text-center text-xs text-muted-foreground">All equipment has been returned.</p> : null}</CardContent>
          </Card> : null}

          {canPlanner ? <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 pb-3"><CardTitle className="flex items-center gap-2 text-sm"><FlaskConical className="h-4 w-4 text-violet-600" />Active spray plans</CardTitle><Link href="/dashboard/agriculture/planner" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Manage</Link></CardHeader>
            <CardContent className="space-y-3">{activePlans.slice(0, 3).map(plan => { const progress = plan.totalApplications > 0 ? Math.round(plan.completedApplications / plan.totalApplications * 100) : 0; const shortfall = plan.items.some(item => !item.isStockSufficient); return <div key={plan.id} className="rounded-xl border p-3 text-xs"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{plan.planName}</p><p className="mt-0.5 text-muted-foreground">{plan.farmZone} | {plan.cycle}</p></div>{shortfall ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> : null}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, progress)}%` }} /></div><p className="mt-1.5 text-muted-foreground">{plan.completedApplications} of {plan.totalApplications} applications</p></div>; })}{!activePlans.length ? <p className="py-3 text-center text-xs text-muted-foreground">No active spray plans.</p> : null}</CardContent>
          </Card> : null}

          {quickActions.length ? <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Quick actions</CardTitle></CardHeader>
            <CardContent className="space-y-1">{quickActions.map(action => { const Icon = action.icon; return <Link key={`${action.href}-${action.label}`} href={action.href} className="group flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-accent"><Icon className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{action.label}</span><ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></Link>; })}</CardContent>
          </Card> : null}

          {!quickActions.length ? <Card><CardContent className="py-8 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">Overview access only</p><p className="mt-1 text-xs text-muted-foreground">An owner or manager can add operational modules to your role.</p></CardContent></Card> : null}
        </aside>
      </div>

      {unreadAlerts.length && !criticalAlerts.length ? <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-xs text-muted-foreground"><Bell className="h-4 w-4" />{unreadAlerts.length} non-critical alert{unreadAlerts.length === 1 ? '' : 's'} remain in your assigned modules.</div> : null}
    </div>
  );
}
