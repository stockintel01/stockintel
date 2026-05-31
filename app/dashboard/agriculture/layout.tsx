'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Leaf, LayoutDashboard, Package, ShoppingCart, FlaskConical,
  Tractor, CalendarDays, Boxes, BarChart3, ChevronLeft,
  ChevronRight, Bell, Cloud, Sun, CloudRain, CloudLightning,
  Droplets, Wind, Thermometer
} from 'lucide-react';
import { MOCK_AGRIC_ALERTS, MOCK_STOCK_REQUESTS, MOCK_EQUIPMENT_CHECKOUTS } from '@/lib/agric/mock-data';

// Nav sections
const CROP_NAV = [
  { href: '/dashboard/agriculture', label: 'Farm Overview', icon: LayoutDashboard },
  { href: '/dashboard/agriculture/stock-management', label: 'Stock Management', icon: Package },
  { href: '/dashboard/agriculture/requests', label: 'Stock Requests', icon: ShoppingCart, badgeKey: 'requests' },
  { href: '/dashboard/agriculture/usage-tracker', label: 'Usage Tracker', icon: FlaskConical },
  { href: '/dashboard/agriculture/planner', label: 'Spray Planner', icon: CalendarDays },
  { href: '/dashboard/agriculture/equipment', label: 'Equipment', icon: Tractor, badgeKey: 'equipment' },
  { href: '/dashboard/agriculture/packing-station', label: 'Packing Station', icon: Boxes },
];

const LIVESTOCK_NAV = [
  { href: '/dashboard/agriculture/livestock', label: 'Livestock Overview', icon: LayoutDashboard },
  { href: '/dashboard/agriculture/livestock/egg-production', label: '🥚 Egg Production', icon: BarChart3 },
  { href: '/dashboard/agriculture/livestock/feed', label: '🌾 Feed Log', icon: Package },
  { href: '/dashboard/agriculture/livestock/mortality', label: '📉 Mortality', icon: AlertTriangle },
  { href: '/dashboard/agriculture/livestock/health', label: '💉 Health & Vaccines', icon: Tractor },
  { href: '/dashboard/agriculture/livestock/growth', label: '⚖️ Growth / Weight', icon: TrendingUp },
  { href: '/dashboard/agriculture/livestock/milk', label: '🥛 Milk Production', icon: Boxes },
];

const NAV_ITEMS = [...CROP_NAV, ...LIVESTOCK_NAV,
  { href: '/dashboard/agriculture/weather', label: 'Live Weather', icon: Cloud, badgeKey: 'weather' },
  { href: '/dashboard/agriculture/reports', label: 'Reports', icon: BarChart3 },
];

function decodeWMO(code: number) {
  if (code === 0) return { label: 'Clear', icon: Sun, color: 'text-yellow-500' };
  if (code <= 2) return { label: 'Partly Cloudy', icon: Cloud, color: 'text-blue-400' };
  if (code === 3) return { label: 'Overcast', icon: Cloud, color: 'text-slate-400' };
  if (code <= 57) return { label: 'Drizzle', icon: CloudRain, color: 'text-blue-400' };
  if (code <= 67) return { label: 'Rain', icon: CloudRain, color: 'text-blue-600' };
  if (code <= 82) return { label: 'Showers', icon: CloudRain, color: 'text-blue-500' };
  if (code <= 99) return { label: 'Thunderstorm', icon: CloudLightning, color: 'text-purple-600' };
  return { label: 'Cloudy', icon: Cloud, color: 'text-slate-400' };
}

function SidebarWeatherWidget({ collapsed }: { collapsed: boolean }) {
  const [wx, setWx] = useState<any>(null);
  const [alertLevel, setAlertLevel] = useState<'good' | 'caution' | 'bad'>('good');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=5.6037&longitude=-0.1870&current=temperature_2m,weather_code,wind_speed_10m,precipitation,relative_humidity_2m&timezone=Africa%2FAccra'
        );
        if (!res.ok) return;
        const data = await res.json();
        const c = data.current;
        setWx(c);
        const code = c.weather_code;
        const wind = c.wind_speed_10m;
        if (code >= 95 || code >= 61 && code <= 67) setAlertLevel('bad');
        else if (wind > 20 || code >= 51) setAlertLevel('caution');
        else setAlertLevel('good');
      } catch { /* silent */ }
    }
    load();
    const t = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (!wx) return null;

  const decoded = decodeWMO(wx.weather_code);
  const WxIcon = decoded.icon;

  const bgColors = { good: 'bg-green-50 border-green-200', caution: 'bg-amber-50 border-amber-200', bad: 'bg-red-50 border-red-200' };
  const textColors = { good: 'text-green-700', caution: 'text-amber-700', bad: 'text-red-700' };
  const sprayLabel = { good: '✓ Good Spray Window', caution: '⚠ Caution', bad: '✗ No Spray' };

  if (collapsed) {
    return (
      <Link href="/dashboard/agriculture/weather">
        <div className={`mx-1 mt-2 p-2 rounded-lg border ${bgColors[alertLevel]} cursor-pointer`} title={`${wx.temperature_2m.toFixed(0)}°C · ${decoded.label}`}>
          <WxIcon className={`w-4 h-4 mx-auto ${decoded.color}`} />
        </div>
      </Link>
    );
  }

  return (
    <Link href="/dashboard/agriculture/weather">
      <div className={`mx-3 mt-3 px-3 py-2.5 rounded-xl border ${bgColors[alertLevel]} cursor-pointer hover:opacity-90 transition-opacity`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <WxIcon className={`w-4 h-4 ${decoded.color}`} />
            <span className="text-sm font-bold">{wx.temperature_2m.toFixed(0)}°C</span>
          </div>
          <span className="text-xs text-muted-foreground">Accra</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{decoded.label}</p>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5"><Droplets className="w-3 h-3" />{wx.relative_humidity_2m}%</span>
          <span className="flex items-center gap-0.5"><Wind className="w-3 h-3" />{wx.wind_speed_10m.toFixed(0)} km/h</span>
        </div>
        <p className={`text-xs font-semibold mt-1.5 ${textColors[alertLevel]}`}>{sprayLabel[alertLevel]}</p>
      </div>
    </Link>
  );
}

export default function AgricultureLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const pendingRequests = MOCK_STOCK_REQUESTS.filter(r => r.status === 'pending').length;
  const overdueEquipment = MOCK_EQUIPMENT_CHECKOUTS.filter(e => e.isOverdue && !e.isReturned).length;
  const unreadAlerts = MOCK_AGRIC_ALERTS.filter(a => !a.isRead).length;

  const getBadge = (key?: string): number => {
    if (key === 'requests') return pendingRequests;
    if (key === 'equipment') return overdueEquipment;
    return 0;
  };

  return (
    <div className="flex h-full min-h-screen bg-background">
      {/* Agric Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-56'} flex-shrink-0 border-r bg-card transition-all duration-200 flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-4'} py-4 border-b`}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-green-600 flex items-center justify-center">
                <Leaf className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm leading-none">Farm Ops</p>
                <p className="text-xs text-muted-foreground">Agriculture</p>
              </div>
            </div>
          )}
          {collapsed && <Leaf className="w-5 h-5 text-green-600" />}
          <button
            onClick={() => setCollapsed(c => !c)}
            className={`p-1 rounded hover:bg-muted transition-colors ${collapsed ? 'mt-2' : ''}`}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Live Weather Widget */}
        <SidebarWeatherWidget collapsed={collapsed} />

        {/* Alerts Badge */}
        {!collapsed && unreadAlerts > 0 && (
          <div className="mx-3 mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-600" />
            <p className="text-xs text-amber-700 font-medium">{unreadAlerts} active alert{unreadAlerts > 1 ? 's' : ''}</p>
          </div>
        )}

        {/* Nav Items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon, badgeKey }) => {
            const isActive = pathname === href || (href !== '/dashboard/agriculture' && pathname.startsWith(href));
            const badge = getBadge(badgeKey);
            const isWeather = href.includes('weather');
            return (
              <Link key={href} href={href}>
                <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg transition-colors relative
                  ${isActive
                    ? 'bg-green-50 text-green-700 font-medium'
                    : isWeather
                    ? 'text-blue-600 hover:bg-blue-50'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-green-600' : isWeather ? 'text-blue-500' : ''}`} />
                  {!collapsed && <span className="text-sm flex-1">{label}</span>}
                  {!collapsed && badge > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">{badge}</span>
                  )}
                  {collapsed && badge > 0 && (
                    <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        {!collapsed && (
          <div className="px-4 py-3 border-t">
            <Link href="/dashboard">
              <p className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <ChevronLeft className="w-3 h-3" /> Back to Main Dashboard
              </p>
            </Link>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
