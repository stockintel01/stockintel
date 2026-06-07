'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { isSuperAdminEmail } from '@/lib/access-control';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
    BarChart3, Box, Calculator, Home, Leaf, LogOut,
    Menu, Package, Pill, Settings, ShoppingCart, Store,
    Users, X, UserCog, Shield, FileText, Gift, Wallet,
    ChevronDown, FlaskConical, CalendarDays, Tractor, PackageCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInventory } from '@/lib/hooks/useInventory';

interface NavItem {
    name: string;
    href: string;
    icon: React.ElementType;
}

interface NavGroup {
    label: string;
    items: NavItem[];
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    useInventory();
    const router = useRouter();
    const pathname = usePathname();
    const { user, activeIndustry, isAuthenticated, inventory } = useAppStore();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [expiringCount, setExpiringCount] = useState(0);
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
        'Clinical': true, 'Operations': true, 'Business': false,
        'Field': true, 'Store': true,
    });

    // Live expiry badge count
    useEffect(() => {
        const check = () => {
            const today = new Date();
            const count = inventory.filter(item => {
                const diff = Math.ceil((new Date(item.expiryDate).getTime() - today.getTime()) / 86400000);
                return diff <= 30;
            }).length;
            setExpiringCount(count);
        };
        check();
        const interval = setInterval(check, 60000);
        return () => clearInterval(interval);
    }, [inventory]);

    const { loading: authLoading, logout } = useAuth();

    // Auth guard — only redirect after Firebase has fully resolved auth state.
    // Without the authLoading check, the guard fires with isAuthenticated=false
    // before onAuthStateChanged completes, causing a redirect loop.
    useEffect(() => {
        if (!authLoading && !user && !isAuthenticated) {
            router.replace('/login');
        }
    }, [authLoading, user, isAuthenticated, router]);

    if (authLoading || !user || !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Grouped nav configs per industry
    const industryConfig: Record<string, { name: string; icon: React.ElementType; color: string; groups: NavGroup[] }> = {
        pharmacy: {
            name: 'StockIntel Pharmacy',
            icon: Pill,
            color: 'text-blue-600',
            groups: [
                {
                    label: 'Clinical',
                    items: [
                        { name: 'Overview', href: '/dashboard', icon: Home },
                        { name: 'Patients', href: '/dashboard/patients', icon: FileText },
                        { name: 'Prescriptions', href: '/dashboard/prescriptions', icon: Calculator },
                        { name: 'Consultation AI', href: '/dashboard/pharmacy/consultation', icon: Users },
                        { name: 'Drug Analytics', href: '/dashboard/pharmacy/analytics', icon: BarChart3 },
                    ],
                },
                {
                    label: 'Operations',
                    items: [
                        { name: 'Inventory', href: '/dashboard/inventory', icon: Box },
                        { name: 'Sales (POS)', href: '/dashboard/sales', icon: ShoppingCart },
                        { name: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
                    ],
                },
                {
                    label: 'Business',
                    items: [
                        { name: 'Team', href: '/dashboard/team', icon: UserCog },
                        { name: 'Rewards', href: '/dashboard/rewards', icon: Gift },
                        { name: 'Billing', href: '/dashboard/billing', icon: Wallet },
                        { name: 'Settings', href: '/dashboard/settings', icon: Settings },
                        ...(isSuperAdminEmail(user?.email) ? [{ name: 'Admin Dashboard', href: '/dashboard/admin', icon: Shield }] : []),
                    ],
                },
            ],
        },
        agriculture: {
            name: 'StockIntel Agri',
            icon: Leaf,
            color: 'text-green-600',
            groups: [
                {
                    label: 'Overview',
                    items: [
                        { name: 'Farm Overview', href: '/dashboard/agriculture', icon: Home },
                    ],
                },
                {
                    label: 'Inventory',
                    items: [
                        { name: 'Stock Management', href: '/dashboard/agriculture/stock-management', icon: Box },
                        { name: 'Stock Requests', href: '/dashboard/agriculture/requests', icon: ShoppingCart },
                        { name: 'Usage Tracker', href: '/dashboard/agriculture/usage-tracker', icon: FlaskConical },
                    ],
                },
                {
                    label: 'Planning & Operations',
                    items: [
                        { name: 'Spray Planner', href: '/dashboard/agriculture/planner', icon: CalendarDays },
                        { name: 'Equipment', href: '/dashboard/agriculture/equipment', icon: Tractor },
                        { name: 'Packing Station', href: '/dashboard/agriculture/packing-station', icon: PackageCheck },
                    ],
                },
                {
                    label: 'Reports',
                    items: [
                        { name: 'Reports', href: '/dashboard/agriculture/reports', icon: BarChart3 },
                    ],
                },
                {
                    label: 'Business',
                    items: [
                        { name: 'Team', href: '/dashboard/team', icon: UserCog },
                        { name: 'Rewards', href: '/dashboard/rewards', icon: Gift },
                        { name: 'Settings', href: '/dashboard/settings', icon: Settings },
                        ...(isSuperAdminEmail(user?.email) ? [{ name: 'Admin Dashboard', href: '/dashboard/admin', icon: Shield }] : []),
                    ],
                },
            ],
        },
        retail: {
            name: 'StockIntel Retail',
            icon: Store,
            color: 'text-violet-600',
            groups: [
                {
                    label: 'Store',
                    items: [
                        { name: 'Overview', href: '/dashboard', icon: Home },
                        { name: 'Inventory', href: '/dashboard/inventory', icon: Box },
                        { name: 'Orders', href: '/dashboard/orders', icon: Package },
                        { name: 'Customers', href: '/dashboard/customers', icon: Users },
                    ],
                },
                {
                    label: 'Operations',
                    items: [
                        { name: 'Sales (POS)', href: '/dashboard/sales', icon: ShoppingCart },
                        { name: 'Analytics', href: '/dashboard/reports', icon: BarChart3 },
                    ],
                },
                {
                    label: 'Business',
                    items: [
                        { name: 'Team', href: '/dashboard/team', icon: UserCog },
                        { name: 'Rewards', href: '/dashboard/rewards', icon: Gift },
                        { name: 'Settings', href: '/dashboard/settings', icon: Settings },
                        ...(isSuperAdminEmail(user?.email) ? [{ name: 'Admin Dashboard', href: '/dashboard/admin', icon: Shield }] : []),
                    ],
                },
            ],
        },
    };

    const config = industryConfig[activeIndustry || 'pharmacy'];
    const ActiveIcon = config.icon;

    const toggleGroup = (label: string) => {
        setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
    };

    return (
        <div className="min-h-screen bg-muted/20 flex">
            {/* Sidebar */}
            <aside className={cn(
                'fixed inset-y-0 left-0 z-50 w-64 bg-background border-r flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0',
                !isSidebarOpen && '-translate-x-full'
            )}>
                {/* Logo */}
                <div className="h-16 flex items-center gap-2 px-5 border-b font-bold text-base shrink-0">
                    <ActiveIcon className={cn('w-5 h-5', config.color)} />
                    <span className="truncate">{config.name}</span>
                    <button className="ml-auto lg:hidden" onClick={() => setIsSidebarOpen(false)}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Nav groups — scrollable */}
                <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
                    {config.groups.map(group => {
                        const isOpen = openGroups[group.label] !== false; // default open
                        return (
                            <div key={group.label}>
                                {/* Group header */}
                                <button
                                    onClick={() => toggleGroup(group.label)}
                                    className="w-full flex items-center justify-between px-2 py-1.5 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                                >
                                    {group.label}
                                    <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', !isOpen && '-rotate-90')} />
                                </button>

                                {/* Items */}
                                {isOpen && (
                                    <div className="space-y-0.5 mb-3">
                                        {group.items.map(item => {
                                            const isActive = pathname === item.href;
                                            return (
                                                <Link
                                                    key={item.href}
                                                    href={item.href}
                                                    className={cn(
                                                        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                                                        isActive
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                                    )}
                                                >
                                                    <item.icon className="w-4 h-4 shrink-0" />
                                                    <span className="flex-1 truncate">{item.name}</span>
                                                    {item.name === 'Inventory' && expiringCount > 0 && (
                                                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                                                            {expiringCount}
                                                        </span>
                                                    )}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                {/* User card */}
                <div className="shrink-0 p-3 border-t">
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg mb-2">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                            {user?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{user?.name || 'Guest'}</div>
                            <div className="text-xs text-muted-foreground capitalize">{user?.role || 'Visitor'}</div>
                        </div>
                    </div>
                    <Button variant="outline" className="w-full justify-start gap-2 text-sm" onClick={logout}>
                        <LogOut className="w-4 h-4" /> Log out
                    </Button>
                </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-h-screen min-w-0">
                {/* Top bar */}
                <header className="h-16 border-b bg-background/50 backdrop-blur sticky top-0 z-40 flex items-center px-6 gap-4 shrink-0">
                    <button className="lg:hidden" onClick={() => setIsSidebarOpen(true)}>
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                        {expiringCount > 0 && (
                            <Link href="/dashboard/inventory">
                                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-full font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    {expiringCount} expiring soon
                                </div>
                            </Link>
                        )}
                        <Link href="/dashboard/settings">
                            <Button variant="ghost" size="icon">
                                <Settings className="w-5 h-5" />
                            </Button>
                        </Link>
                    </div>
                </header>

                <main className="flex-1 p-6">
                    {children}
                </main>
            </div>

            {/* Mobile overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-40 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}
        </div>
    );
}
