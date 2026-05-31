'use client';

import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, DollarSign, Package, AlertTriangle, Activity, Download, TrendingUp, TrendingDown } from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const revenueData = [
    { name: 'Jan', revenue: 24000, sales: 180 },
    { name: 'Feb', revenue: 28000, sales: 210 },
    { name: 'Mar', revenue: 32000, sales: 240 },
    { name: 'Apr', revenue: 29000, sales: 220 },
    { name: 'May', revenue: 35000, sales: 260 },
    { name: 'Jun', revenue: 42000, sales: 310 },
    { name: 'Jul', revenue: 45231, sales: 330 },
];

const recentTransactions = [
    { name: 'Dr. Sarah Wilson', ref: 'RX-2026-0312', amount: '1,234.00', time: '2m ago', avatar: 'S' },
    { name: 'Patient: Alice M.', ref: 'RX-2026-0311', amount: '542.50', time: '18m ago', avatar: 'A' },
    { name: 'Walk-in Customer', ref: 'POS-0892', amount: '320.00', time: '45m ago', avatar: 'W' },
    { name: 'Bob Johnson', ref: 'RX-2026-0310', amount: '850.00', time: '1h ago', avatar: 'B' },
    { name: 'Corporate: MedCorp', ref: 'INV-0041', amount: '4,125.00', time: '2h ago', avatar: 'M' },
];

// ✅ Fix: Use explicit interface instead of TooltipProps generic (Recharts v3+ typing change)
interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{ value: number | string; name: string; color?: string }>;
    label?: string;
}

// Custom tooltip for the revenue chart
const RevenueTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-background border border-border rounded-xl shadow-lg px-4 py-3 text-sm">
            <p className="font-semibold text-foreground mb-1">{label}</p>
            <p className="text-primary font-mono">
                `${currency}`+`${typeof payload[0]?.value === 'number' ? payload[0].value.toLocaleString() : payload[0]?.value}
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
                {payload[1]?.value} transactions
            </p>
        </div>
    );
};

// Custom tooltip for bar chart
const SalesTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-background border border-border rounded-xl shadow-lg px-4 py-3 text-sm">
            <p className="font-semibold text-foreground mb-1">{label}</p>
            <p className="text-indigo-500 font-mono">{payload[0]?.value} sales</p>
        </div>
    );
};

export default function DashboardHome() {
    const { activeIndustry, currency } = useAppStore();

    const metrics = {
        pharmacy: [
            { label: 'Total Revenue', value: '${currency}45,231', icon: DollarSign, trend: '+20.1%', up: true, desc: 'vs last month' },
            { label: 'Prescriptions', value: '2,350', icon: Activity, trend: '+180', up: true, desc: 'this month' },
            { label: 'Low Stock Items', value: '12', icon: AlertTriangle, trend: '−5', up: true, desc: 'resolved this week' },
            { label: 'Active Inventory', value: '12,234', icon: Package, trend: '+19', up: true, desc: 'items in stock' },
        ],
        agriculture: [
            { label: 'Sales Revenue', value: `${currency}1,24,231`, icon: DollarSign, trend: '+12.5%', up: true, desc: 'seasonal peak' },
            { label: 'Active Orders', value: '45', icon: Package, trend: '+4', up: true, desc: 'processing' },
            { label: 'Low Fertilizer Stock', value: '8', icon: AlertTriangle, trend: '+2', up: false, desc: 'urgent reorder' },
            { label: 'Equipment Rented', value: '12', icon: Activity, trend: '85%', up: true, desc: 'utilization' },
        ],
        retail: [
            { label: 'Daily Sales', value: `${currency}24,500`, icon: DollarSign, trend: '+10%', up: true, desc: 'vs yesterday' },
            { label: 'Transactions', value: '145', icon: Activity, trend: '+12%', up: true, desc: 'vs yesterday' },
            { label: 'Out of Stock', value: '3', icon: AlertTriangle, trend: '−2', up: true, desc: 'items critical' },
            { label: 'Total Items', value: '5,432', icon: Package, trend: '+50', up: true, desc: 'new added' },
        ],
    };

    const currentMetrics = metrics[activeIndustry || 'pharmacy'];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-muted-foreground text-sm mt-1">
                        {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </div>
                <Button className="gap-2">
                    <Download className="w-4 h-4" /> Export Report
                </Button>
            </div>

            {/* Metric Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {currentMetrics.map((metric, i) => (
                    <Card key={i} className="relative overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {metric.label}
                            </CardTitle>
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <metric.icon className="h-4 w-4 text-primary" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight">{metric.value}</div>
                            <div className="flex items-center gap-1.5 mt-1">
                                {metric.up
                                    ? <TrendingUp className="w-3 h-3 text-emerald-500" />
                                    : <TrendingDown className="w-3 h-3 text-red-500" />
                                }
                                <span className={`text-xs font-medium ${metric.up ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {metric.trend}
                                </span>
                                <span className="text-xs text-muted-foreground">{metric.desc}</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Charts row */}
            <div className="grid gap-6 lg:grid-cols-7">

                {/* Revenue Area Chart */}
                <Card className="lg:col-span-4">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Revenue Overview</CardTitle>
                                <p className="text-sm text-muted-foreground mt-0.5">Monthly revenue trend, Jan–Jul</p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-bold">${currency}45,231</p>
                                <p className="text-xs text-emerald-500 flex items-center justify-end gap-1">
                                    <TrendingUp className="w-3 h-3" /> +20.1% this month
                                </p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <ResponsiveContainer width="100%" height={260}>
                            <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                    tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`}
                                />
                                <Tooltip content={<RevenueTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2.5}
                                    fill="url(#revenueGradient)"
                                    dot={false}
                                    activeDot={{ r: 5, strokeWidth: 0, fill: 'hsl(var(--primary))' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Sales Bar Chart */}
                <Card className="lg:col-span-3">
                    <CardHeader className="pb-2">
                        <CardTitle>Daily Transactions</CardTitle>
                        <p className="text-sm text-muted-foreground">Sales count per month</p>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barSize={24}>
                                <defs>
                                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.4} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                />
                                <Tooltip content={<SalesTooltip />} />
                                <Bar
                                    dataKey="sales"
                                    fill="url(#barGradient)"
                                    radius={[6, 6, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Transactions */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Recent Transactions</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">Latest 5 sales activity</p>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-1 text-xs">
                        View All <ArrowUpRight className="w-3 h-3" />
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="divide-y divide-border">
                        {recentTransactions.map((tx, i) => (
                            <div key={i} className="flex items-center justify-between py-3 group">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                                        {tx.avatar}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium leading-none">{tx.name}</p>
                                        <p className="text-xs text-muted-foreground mt-1 font-mono">{tx.ref}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-semibold">`+${currency}${tx.amount}`</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{tx.time}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}