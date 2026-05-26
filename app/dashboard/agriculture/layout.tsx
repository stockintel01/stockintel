'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Leaf, LayoutDashboard, Package, ShoppingCart, FlaskConical,
  Tractor, CalendarDays, Boxes, BarChart3, ChevronLeft,
  ChevronRight, Bell, Bug
} from 'lucide-react';
import { MOCK_AGRIC_ALERTS, MOCK_STOCK_REQUESTS, MOCK_EQUIPMENT_CHECKOUTS } from '@/lib/agric/mock-data';

const NAV_ITEMS = [
  { href: '/dashboard/agriculture', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/agriculture/stock-management', label: 'Stock Management', icon: Package },
  { href: '/dashboard/agriculture/requests', label: 'Stock Requests', icon: ShoppingCart, badgeKey: 'requests' },
  { href: '/dashboard/agriculture/usage-tracker', label: 'Usage Tracker', icon: FlaskConical },
  { href: '/dashboard/agriculture/planner', label: 'Spray Planner', icon: CalendarDays },
  { href: '/dashboard/agriculture/equipment', label: 'Equipment', icon: Tractor, badgeKey: 'equipment' },
  { href: '/dashboard/agriculture/packing-station', label: 'Packing Station', icon: Boxes },
  { href: '/dashboard/agriculture/reports', label: 'Reports', icon: BarChart3 },
];

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

        {/* Alerts Badge */}
        {!collapsed && unreadAlerts > 0 && (
          <div className="mx-3 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-600" />
            <p className="text-xs text-amber-700 font-medium">{unreadAlerts} active alert{unreadAlerts > 1 ? 's' : ''}</p>
          </div>
        )}

        {/* Nav Items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon, badgeKey }) => {
            const isActive = pathname === href || (href !== '/dashboard/agriculture' && pathname.startsWith(href));
            const badge = getBadge(badgeKey);
            return (
              <Link key={href} href={href}>
                <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg transition-colors relative
                  ${isActive ? 'bg-green-50 text-green-700 font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-green-600' : ''}`} />
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
