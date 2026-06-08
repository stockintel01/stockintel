'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { AlertTriangle, ArrowUpRight, DollarSign, Package, ReceiptText } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/firebase';
import { useAppStore } from '@/lib/store';

interface Sale {
    id: string;
    billNumber?: string;
    cashierName?: string;
    customerName?: string;
    grandTotal: number;
    createdAt?: Timestamp | Date | string | null;
}

function asDate(value: Sale['createdAt']): Date | null {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export default function DashboardHome() {
    const { organization, inventory, currency, activeIndustry } = useAppStore();
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!organization?.id) {
            setSales([]);
            setLoading(false);
            return;
        }

        const salesQuery = query(
            collection(db, `organizations/${organization.id}/sales`),
            orderBy('createdAt', 'desc'),
            limit(500),
        );
        return onSnapshot(salesQuery, snapshot => {
            setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)));
            setLoading(false);
            setError('');
        }, err => {
            console.error('[dashboard sales]', err);
            setSales([]);
            setLoading(false);
            setError('Sales data could not be loaded. Check Firebase rules and connectivity.');
        });
    }, [organization?.id]);

    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0);
    const lowStock = inventory.filter(item => item.quantity <= (item.reorderLevel ?? 10)).length;
    const stockUnits = inventory.reduce((sum, item) => sum + item.quantity, 0);
    const stockCostValue = inventory.reduce((sum, item) => sum + item.quantity * Number(item.costPrice || 0), 0);
    const stockRetailValue = inventory.reduce((sum, item) => sum + item.quantity * Number(item.mrp || 0), 0);
    const potentialMargin = stockRetailValue - stockCostValue;
    const chartData = useMemo(() => {
        const months = new Map<string, { name: string; revenue: number; sales: number }>();
        for (const sale of sales) {
            const date = asDate(sale.createdAt);
            if (!date) continue;
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            const name = date.toLocaleDateString('en', { month: 'short', year: '2-digit' });
            const current = months.get(key) ?? { name, revenue: 0, sales: 0 };
            current.revenue += Number(sale.grandTotal || 0);
            current.sales += 1;
            months.set(key, current);
        }
        return [...months.values()].reverse().slice(-7);
    }, [sales]);

    const standardMetrics = [
        { label: 'Total Revenue', value: `${currency}${totalRevenue.toLocaleString()}`, icon: DollarSign },
        { label: 'Transactions', value: sales.length.toLocaleString(), icon: ReceiptText },
        { label: 'Low Stock Items', value: lowStock.toLocaleString(), icon: AlertTriangle },
        { label: 'Units In Stock', value: stockUnits.toLocaleString(), icon: Package },
    ];
    const retailMetrics = [
        { label: 'Sales Revenue', value: `${currency}${totalRevenue.toLocaleString()}`, icon: DollarSign },
        { label: 'Stock at Cost', value: `${currency}${stockCostValue.toLocaleString()}`, icon: Package },
        { label: 'Potential Gross Margin', value: `${currency}${potentialMargin.toLocaleString()}`, icon: ArrowUpRight },
        { label: 'Reorder Required', value: lowStock.toLocaleString(), icon: AlertTriangle },
    ];
    const metrics = activeIndustry === 'retail' ? retailMetrics : standardMetrics;

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{activeIndustry === 'retail' ? 'Retail Stock Intelligence' : 'Dashboard'}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{organization?.name ?? 'Your organization'} live overview</p>
                </div>
                <Link href="/dashboard/reports"><Button variant="outline">Open reports <ArrowUpRight className="w-4 h-4 ml-2" /></Button></Link>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {metrics.map(metric => (
                    <Card key={metric.label}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{metric.label}</CardTitle>
                            <metric.icon className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent><div className="text-2xl font-bold">{loading ? '...' : metric.value}</div></CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader><CardTitle>Revenue Overview</CardTitle></CardHeader>
                <CardContent>
                    {chartData.length === 0 && !loading ? (
                        <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">No completed sales yet.</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={288}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" />
                                <YAxis tickFormatter={value => `${currency}${value}`} />
                                <Tooltip formatter={(value) => `${currency}${Number(value).toLocaleString()}`} />
                                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader>
                <CardContent>
                    {sales.length === 0 && !loading ? <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet.</p> : (
                        <div className="divide-y">
                            {sales.slice(0, 5).map(sale => (
                                <div key={sale.id} className="flex justify-between py-3 text-sm">
                                    <div><p className="font-medium">{sale.customerName || 'Walk-in customer'}</p><p className="text-xs text-muted-foreground">{sale.billNumber || sale.id}</p></div>
                                    <div className="text-right"><p className="font-semibold">{currency}{Number(sale.grandTotal || 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">{asDate(sale.createdAt)?.toLocaleString() ?? 'Pending timestamp'}</p></div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
