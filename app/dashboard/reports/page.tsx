'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { Download, DollarSign, Package, ReceiptText } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/firebase';
import { exportToCsv } from '@/lib/inventory-service';
import { useAppStore } from '@/lib/store';

interface Sale {
    id: string;
    billNumber?: string;
    cashierName?: string;
    grandTotal: number;
    createdAt?: Timestamp | null;
}

function downloadSales(sales: Sale[]) {
    const rows = [
        ['Bill Number', 'Cashier', 'Total', 'Date'],
        ...sales.map(sale => [
            sale.billNumber ?? sale.id,
            sale.cashierName ?? '',
            String(sale.grandTotal ?? 0),
            sale.createdAt?.toDate?.().toISOString() ?? '',
        ]),
    ];
    const csv = rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sales-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
}

export default function ReportsPage() {
    const { organization, inventory, currency } = useAppStore();
    const [sales, setSales] = useState<Sale[]>([]);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!organization?.id) return;
        return onSnapshot(
            query(collection(db, `organizations/${organization.id}/sales`), orderBy('createdAt', 'desc')),
            snapshot => {
                setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)));
                setError('');
            },
            err => {
                console.error('[reports]', err);
                setError('Reports could not load from Firebase.');
            },
        );
    }, [organization?.id]);

    const chart = useMemo(() => {
        const totals = new Map<string, number>();
        sales.forEach(sale => {
            const date = sale.createdAt?.toDate?.();
            if (!date) return;
            const label = date.toLocaleDateString('en', { month: 'short', year: '2-digit' });
            totals.set(label, (totals.get(label) ?? 0) + Number(sale.grandTotal || 0));
        });
        return [...totals].reverse().map(([month, revenue]) => ({ month, revenue }));
    }, [sales]);

    const revenue = sales.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0);
    const stockValue = inventory.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h1 className="text-3xl font-bold">Reports</h1><p className="text-muted-foreground">Live Firebase sales and inventory data</p></div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => downloadSales(sales)}><Download className="w-4 h-4 mr-2" />Sales CSV</Button>
                    <Button variant="outline" onClick={() => exportToCsv(inventory)}><Download className="w-4 h-4 mr-2" />Inventory CSV</Button>
                </div>
            </div>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <div className="grid gap-4 md:grid-cols-3">
                {[
                    ['Revenue', `${currency}${revenue.toLocaleString()}`, DollarSign],
                    ['Transactions', sales.length.toLocaleString(), ReceiptText],
                    ['Stock Cost Value', `${currency}${stockValue.toLocaleString()}`, Package],
                ].map(([label, value, Icon]) => (
                    <Card key={String(label)}><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">{String(label)}</CardTitle><Icon className="w-4 h-4 text-primary" /></CardHeader><CardContent className="text-2xl font-bold">{String(value)}</CardContent></Card>
                ))}
            </div>
            <Card>
                <CardHeader><CardTitle>Revenue By Month</CardTitle></CardHeader>
                <CardContent>
                    {chart.length === 0 ? <p className="py-24 text-center text-sm text-muted-foreground">No sales data available.</p> : (
                        <ResponsiveContainer width="100%" height={320}>
                            <BarChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} /></BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
