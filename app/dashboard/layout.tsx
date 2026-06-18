'use client';

import { useEffect, useState } from 'react';
import { useAppStore, type IndustryType } from '@/lib/store';
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
import { canUseFeature, isSubscriptionActive, type PlanFeature } from '@/lib/plans';
import { getAgricultureProfile } from '@/lib/agric/config';
import { userCanAccessHref } from '@/lib/access-permissions';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

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
    const { user, organization, activeIndustry, setIndustry, isAuthenticated, inventory, setStoreUser } = useAppStore();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
    const superAdmin = isSuperAdminEmail(user?.email);

    useEffect(() => {
        if (!superAdmin && organization?.industry && activeIndustry !== organization.industry) {
            setIndustry(organization.industry);
        }
    }, [activeIndustry, organization?.industry, setIndustry, superAdmin]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsSidebarOpen(false);
    }, [pathname]);

    // Auth guard — only redirect after Firebase has fully resolved auth state.
    // Without the authLoading check, the guard fires with isAuthenticated=false
    // before onAuthStateChanged completes, causing a redirect loop.
    useEffect(() => {
        if (!authLoading && !user && !isAuthenticated) {
            router.replace('/login');
            return;
        }
        if (!authLoading && user && !superAdmin && !isSubscriptionActive(organization?.subscription) && pathname !== '/dashboard/billing') {
            router.replace('/dashboard/billing');
            return;
        }
        const featureRoutes: Array<[string, PlanFeature]> = [
            ['/dashboard/inventory/import', 'bulkImport'],
            ['/dashboard/reports', 'advancedReports'],
            ['/dashboard/pharmacy/analytics', 'advancedReports'],
            ['/dashboard/pharmacy/consultation', 'ai'],
            ['/dashboard/prescriptions', 'ai'],
        ];
        const required = featureRoutes.find(([path]) => pathname.startsWith(path))?.[1];
        if (!authLoading && required && !canUseFeature(organization?.subscription, required, superAdmin)) {
            router.replace('/dashboard/billing');
            return;
        }
        const managerOnlyRoutes = ['/dashboard/team', '/dashboard/inventory/add', '/dashboard/inventory/import'];
        if (!authLoading && managerOnlyRoutes.some(path => pathname.startsWith(path)) && !['super_admin', 'owner', 'manager'].includes(user?.role ?? '') && !userCanAccessHref(user, pathname)) {
            router.replace('/dashboard');
            return;
        }
        if (!authLoading && user && !userCanAccessHref(user, pathname)) {
            router.replace(activeIndustry === 'agriculture' ? '/dashboard/agriculture' : '/dashboard');
        }
    }, [activeIndustry, authLoading, user, isAuthenticated, organization?.subscription, pathname, router, superAdmin]);

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
                        { name: 'Expenses', href: '/dashboard/expenses', icon: Wallet },
                        { name: 'Team', href: '/dashboard/team', icon: UserCog },
                        { name: 'Rewards', href: '/dashboard/rewards', icon: Gift },
                        { name: 'Billing', href: '/dashboard/billing', icon: Wallet },
                        { name: 'Settings', href: '/dashboard/settings', icon: Settings },
                        ...(superAdmin ? [{ name: 'Admin Dashboard', href: '/dashboard/admin', icon: Shield }] : []),
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
                        { name: 'Expenses', href: '/dashboard/expenses', icon: Wallet },
                        { name: 'Team', href: '/dashboard/team', icon: UserCog },
                        { name: 'Rewards', href: '/dashboard/rewards', icon: Gift },
                        { name: 'Settings', href: '/dashboard/settings', icon: Settings },
                        ...(superAdmin ? [{ name: 'Admin Dashboard', href: '/dashboard/admin', icon: Shield }] : []),
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
                        { name: 'Bulk Import', href: '/dashboard/inventory/import', icon: PackageCheck },
                        { name: 'Orders & Sales', href: '/dashboard/sales', icon: Package },
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
                        { name: 'Expenses', href: '/dashboard/expenses', icon: Wallet },
                        { name: 'Team', href: '/dashboard/team', icon: UserCog },
                        { name: 'Rewards', href: '/dashboard/rewards', icon: Gift },
                        { name: 'Settings', href: '/dashboard/settings', icon: Settings },
                        ...(superAdmin ? [{ name: 'Admin Dashboard', href: '/dashboard/admin', icon: Shield }] : []),
                    ],
                },
            ],
        },
    };

    const agricultureProfile = getAgricultureProfile(organization?.settings);
    const baseConfig = industryConfig[activeIndustry || 'pharmacy'];
    const config = activeIndustry === 'agriculture' ? {
        ...baseConfig,
        name: organization?.name || 'Agriculture Workspace',
        groups: [
          ...baseConfig.groups.map(group => ({
            ...group,
            items: group.items.filter(item => {
                if (!agricultureProfile.modules.crops && ['/dashboard/agriculture/requests', '/dashboard/agriculture/usage-tracker', '/dashboard/agriculture/planner', '/dashboard/agriculture/packing-station'].includes(item.href)) return false;
                return true;
            }),
          })).filter(group => group.items.length > 0),
          ...(agricultureProfile.modules.livestock ? [{
            label: agricultureProfile.modules.poultry ? 'Animals & Poultry' : 'Animal Production',
            items: [
              { name: 'Livestock Overview', href: '/dashboard/agriculture/livestock', icon: Leaf },
              ...(agricultureProfile.modules.eggProduction ? [{ name: 'Egg Production', href: '/dashboard/agriculture/livestock/egg-production', icon: BarChart3 }] : []),
              { name: 'Feed Management', href: '/dashboard/agriculture/livestock/feed', icon: Package },
              { name: 'Health & Vaccines', href: '/dashboard/agriculture/livestock/health', icon: FlaskConical },
              { name: 'Growth & Weight', href: '/dashboard/agriculture/livestock/growth', icon: BarChart3 },
              ...(agricultureProfile.modules.dairy ? [{ name: 'Milk Production', href: '/dashboard/agriculture/livestock/milk', icon: PackageCheck }] : []),
            ],
          }] : []),
        ],
    } : baseConfig;
    const visibleGroups = config.groups
        .map(group => ({
            ...group,
            items: group.items.filter(item => userCanAccessHref(user, item.href)),
        }))
        .filter(group => group.items.length > 0);
    const ActiveIcon = config.icon;

    const toggleGroup = (label: string) => {
        setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
    };

    const switchIndustry = (industry: IndustryType) => {
        setIndustry(industry);
        router.push(industry === 'agriculture' ? '/dashboard/agriculture' : '/dashboard');
    };

    const switchTenant = async (organizationId: string) => {
        if (!user || organizationId === user.organizationId) return;
        const membership = user.memberships?.find(item => item.organizationId === organizationId);
        if (!membership) return;
        const orgSnap = await getDoc(doc(db, 'organizations', organizationId));
        if (!orgSnap.exists()) return;
        const nextOrg = { ...(orgSnap.data() as NonNullable<typeof organization>), id: orgSnap.id };
        setStoreUser({
            ...user,
            organizationId,
            role: membership.role,
            access: membership.access,
        }, nextOrg);
        setIndustry(nextOrg.industry);
        router.push(nextOrg.industry === 'agriculture' ? '/dashboard/agriculture' : '/dashboard');
    };

    const mobileNavItems = ([
        { name: 'Home', href: activeIndustry === 'agriculture' ? '/dashboard/agriculture' : '/dashboard', icon: Home },
        { name: activeIndustry === 'agriculture' ? 'Stock' : 'Inventory', href: activeIndustry === 'agriculture' ? '/dashboard/agriculture/stock-management' : '/dashboard/inventory', icon: Box },
        { name: activeIndustry === 'agriculture' && agricultureProfile.modules.livestock ? 'Animals' : 'Sales', href: activeIndustry === 'agriculture' && agricultureProfile.modules.livestock ? '/dashboard/agriculture/livestock' : '/dashboard/sales', icon: activeIndustry === 'agriculture' ? Leaf : ShoppingCart },
        { name: 'Settings', href: '/dashboard/settings', icon: Settings },
    ]).filter(item => userCanAccessHref(user, item.href)).slice(0, 4);

    return (
        <div className="min-h-screen bg-muted/20 flex">
            {/* Sidebar */}
            <aside className={cn(
                'fixed inset-y-0 left-0 z-50 h-screen w-64 bg-background border-r flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0',
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
                    {superAdmin && (
                        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Super Admin Preview</p>
                            <div className="grid grid-cols-3 gap-1">
                                {([
                                    { id: 'pharmacy' as const, label: 'Pharmacy', icon: Pill },
                                    { id: 'agriculture' as const, label: 'Agri', icon: Leaf },
                                    { id: 'retail' as const, label: 'Retail', icon: Store },
                                ]).map(industry => (
                                    <button
                                        key={industry.id}
                                        type="button"
                                        title={`Preview ${industry.label}`}
                                        onClick={() => switchIndustry(industry.id)}
                                        className={cn(
                                            'flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] font-medium transition-colors',
                                            activeIndustry === industry.id ? 'bg-emerald-600 text-white' : 'text-emerald-800 hover:bg-emerald-100',
                                        )}
                                    >
                                        <industry.icon className="w-4 h-4" />
                                        {industry.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {visibleGroups.map(group => {
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
                    {(user.memberships?.length ?? 0) > 1 && (
                        <select
                            value={user.organizationId}
                            onChange={event => void switchTenant(event.target.value)}
                            className="mb-2 w-full rounded-lg border bg-background px-3 py-2 text-xs font-medium"
                            aria-label="Switch organisation workspace"
                        >
                            {user.memberships?.map(membership => (
                                <option key={membership.organizationId} value={membership.organizationId}>
                                    {membership.organizationName || membership.organizationId}
                                </option>
                            ))}
                        </select>
                    )}
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
                        {superAdmin && (
                            <div className="hidden sm:flex items-center gap-1 rounded-lg border bg-background p-1" aria-label="Super admin industry preview">
                                {([
                                    { id: 'pharmacy' as const, label: 'Pharmacy', icon: Pill },
                                    { id: 'agriculture' as const, label: 'Agriculture', icon: Leaf },
                                    { id: 'retail' as const, label: 'Retail', icon: Store },
                                ]).map(industry => (
                                    <button
                                        key={industry.id}
                                        type="button"
                                        onClick={() => switchIndustry(industry.id)}
                                        className={cn(
                                            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                                            activeIndustry === industry.id
                                                ? 'bg-primary text-primary-foreground'
                                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                        )}
                                    >
                                        <industry.icon className="w-3.5 h-3.5" />
                                        {industry.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {(user.memberships?.length ?? 0) > 1 && (
                            <select
                                value={user.organizationId}
                                onChange={event => void switchTenant(event.target.value)}
                                className="hidden max-w-56 rounded-lg border bg-background px-3 py-2 text-xs font-medium sm:block"
                                aria-label="Switch organisation workspace"
                            >
                                {user.memberships?.map(membership => (
                                    <option key={membership.organizationId} value={membership.organizationId}>
                                        {membership.organizationName || membership.organizationId}
                                    </option>
                                ))}
                            </select>
                        )}
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

                <main className="flex-1 p-3 pb-24 sm:p-6 sm:pb-6">
                    {children}
                </main>
            </div>

            {mobileNavItems.length > 0 && (
            <nav className="fixed bottom-0 left-0 right-0 z-50 grid border-t bg-background/95 px-1 py-1.5 shadow-lg backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${mobileNavItems.length}, minmax(0, 1fr))` }}>
                {mobileNavItems.map(item => (
                    <Link key={item.name} href={item.href} className={cn('flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium', pathname === item.href ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}>
                        <item.icon className="h-5 w-5" /><span>{item.name}</span>
                    </Link>
                ))}
            </nav>
            )}

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
