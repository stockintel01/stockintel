'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { Users, Search, Phone, Mail, ShoppingBag, TrendingUp, Plus } from 'lucide-react';

const MOCK_CUSTOMERS = [
    { id: 'C-001', name: 'Ravi Kumar',    phone: '+91 98765 43210', email: 'ravi@email.com',  totalOrders: 12, totalSpend: 4580, lastVisit: '2026-05-21' },
    { id: 'C-002', name: 'Priya Sharma',  phone: '+91 98765 12345', email: 'priya@email.com', totalOrders: 7,  totalSpend: 2100, lastVisit: '2026-05-19' },
    { id: 'C-003', name: 'Anil Mehta',    phone: '+91 99887 76543', email: '',                totalOrders: 3,  totalSpend: 890,  lastVisit: '2026-05-16' },
    { id: 'C-004', name: 'Sunita Patel',  phone: '+91 87654 32198', email: 'sunita@email.com',totalOrders: 22, totalSpend: 9200, lastVisit: '2026-05-22' },
];

export default function CustomersPage() {
    const { currency } = useAppStore();
    const [search, setSearch] = useState('');

    const filtered = MOCK_CUSTOMERS.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) || c.id.includes(search)
    );

    const totalRevenue = MOCK_CUSTOMERS.reduce((s, c) => s + c.totalSpend, 0);
    const totalOrders  = MOCK_CUSTOMERS.reduce((s, c) => s + c.totalOrders, 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
                    <p className="text-muted-foreground">{MOCK_CUSTOMERS.length} registered customers</p>
                </div>
                <Button><Plus className="w-4 h-4 mr-2" /> Add Customer</Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Customers', value: MOCK_CUSTOMERS.length, icon: Users,       color: 'text-primary'        },
                    { label: 'Total Orders',    value: totalOrders,            icon: ShoppingBag, color: 'text-blue-600'       },
                    { label: 'Total Revenue',   value: `${currency}${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-600' },
                    { label: 'Avg Order Value', value: `${currency}${Math.round(totalRevenue / totalOrders)}`, icon: TrendingUp, color: 'text-violet-600' },
                ].map(s => (
                    <Card key={s.label} className="p-4">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">{s.label}</span>
                            <s.icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                        <p className="text-xl font-bold">{s.value}</p>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle>Customer List</CardTitle>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" placeholder="Search name, phone, ID…" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-y">
                            <tr>{['ID', 'Customer', 'Contact', 'Orders', 'Total Spend', 'Last Visit'].map(h => (
                                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                            ))}</tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.map(c => (
                                <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.id}</td>
                                    <td className="px-4 py-3 font-medium">{c.name}</td>
                                    <td className="px-4 py-3 text-muted-foreground text-xs">
                                        <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</div>
                                        {c.email && <div className="flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" />{c.email}</div>}
                                    </td>
                                    <td className="px-4 py-3">{c.totalOrders}</td>
                                    <td className="px-4 py-3 font-semibold">{currency}{c.totalSpend.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{c.lastVisit}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
