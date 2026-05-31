'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Plus, Search, Filter, Download, Upload,
    Trash2, PackageX, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { deleteItem, adjustQuantity, exportToCsv } from '@/lib/inventory-service';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type FilterStatus = 'all' | 'low' | 'expiring' | 'expired';

export default function InventoryPage() {
    const { activeIndustry, currency, inventory, organization, user } = useAppStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const today = new Date();

    function getDiffDays(expiryDate: string) {
        return Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / 86400000);
    }

    function getStatus(item: { quantity: number; expiryDate: string }) {
        const diffDays = getDiffDays(item.expiryDate);
        if (diffDays < 0) return 'expired';
        if (diffDays <= 30) return 'expiring';
        if (item.quantity < 100) return 'low';
        return 'good';
    }

    const filteredItems = inventory.filter(item => {
        const matchSearch =
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.category.toLowerCase().includes(searchTerm.toLowerCase());

        const status = getStatus(item);
        const matchStatus = statusFilter === 'all' || status === statusFilter;

        return matchSearch && matchStatus;
    });

    // Summary counts
    const counts = {
        total: inventory.length,
        expired: inventory.filter(i => getDiffDays(i.expiryDate) < 0).length,
        expiring: inventory.filter(i => { const d = getDiffDays(i.expiryDate); return d >= 0 && d <= 30; }).length,
        low: inventory.filter(i => i.quantity < 100 && getDiffDays(i.expiryDate) >= 0).length,
    };

    async function handleDelete(itemId: string) {
        if (!organization?.id) return;

        setDeletingId(itemId);
        try {
            await deleteItem(organization.id, itemId);
            // Zustand is updated automatically via the real-time listener
        } catch (err) {
            console.error('Failed to delete item. Please try again.');
            console.error(err);
        } finally {
            setDeletingId(null);
        }
    }

    async function handleAdjust(itemId: string, delta: number) {
        if (!organization?.id) return;
        try {
            await adjustQuantity(organization.id, itemId, delta);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Adjustment failed';
            console.error(msg);
        }
    }

    function handleExport() {
        exportToCsv(filteredItems, `${activeIndustry}-inventory-${new Date().toISOString().slice(0, 10)}.csv`);
    }

    const statusConfig: Record<string, { label: string; rowBg: string; badge: string }> = {
        expired: {
            label: 'Expired',
            rowBg: 'bg-red-50 dark:bg-red-950/20',
            badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
        },
        expiring: {
            label: 'Expiring Soon',
            rowBg: 'bg-amber-50 dark:bg-amber-950/20',
            badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
        },
        low: {
            label: 'Low Stock',
            rowBg: '',
            badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
        },
        good: { label: 'In Stock', rowBg: '', badge: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' },
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
                    <p className="text-muted-foreground mt-1">
                        {inventory.length} items · Live-synced with Firestore
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Link href="/dashboard/inventory/import">
                        <Button variant="outline" size="sm"><Upload className="w-4 h-4 mr-2" /> Import</Button>
                    </Link>
                    <Button variant="outline" size="sm" onClick={handleExport}>
                        <Download className="w-4 h-4 mr-2" /> Export CSV
                    </Button>
                    <Link href="/dashboard/inventory/add">
                        <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Item</Button>
                    </Link>
                </div>
            </div>

            {/* Summary tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Items', value: counts.total, icon: CheckCircle2, color: 'text-primary', filter: 'all' as FilterStatus },
                    { label: 'Low Stock', value: counts.low, icon: AlertTriangle, color: 'text-orange-500', filter: 'low' as FilterStatus },
                    { label: 'Expiring ≤30d', value: counts.expiring, icon: AlertTriangle, color: 'text-amber-500', filter: 'expiring' as FilterStatus },
                    { label: 'Expired', value: counts.expired, icon: PackageX, color: 'text-red-500', filter: 'expired' as FilterStatus },
                ].map(tile => (
                    <button
                        key={tile.label}
                        onClick={() => setStatusFilter(statusFilter === tile.filter ? 'all' : tile.filter)}
                        className={cn(
                            'text-left p-4 rounded-xl border bg-background transition-all hover:shadow-sm',
                            statusFilter === tile.filter && 'ring-2 ring-primary'
                        )}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground font-medium">{tile.label}</span>
                            <tile.icon className={cn('w-4 h-4', tile.color)} />
                        </div>
                        <p className="text-2xl font-bold">{tile.value}</p>
                    </button>
                ))}
            </div>

            {/* Table */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <CardTitle className="flex items-center gap-2">
                            Live Stock
                            {statusFilter !== 'all' && (
                                <span className="text-xs font-normal text-muted-foreground">
                                    — filtered: {statusFilter}
                                </span>
                            )}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search name, SKU, category…"
                                    className="pl-8 w-56"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <Button variant="outline" size="icon"><Filter className="w-4 h-4" /></Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <PackageX className="w-12 h-12 text-muted-foreground/30 mb-3" />
                            <p className="font-medium text-muted-foreground">No items match your search</p>
                            <p className="text-sm text-muted-foreground/70 mt-1">Try a different keyword or clear the filter</p>
                            <Button variant="ghost" size="sm" className="mt-4" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}>
                                Clear filters
                            </Button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide font-medium border-y">
                                    <tr>
                                        <th className="px-4 py-3">Item Name</th>
                                        <th className="px-4 py-3">SKU / Batch</th>
                                        <th className="px-4 py-3">Category</th>
                                        <th className="px-4 py-3 text-right">Qty</th>
                                        <th className="px-4 py-3 text-right">Cost</th>
                                        <th className="px-4 py-3 text-right">MRP</th>
                                        <th className="px-4 py-3 text-right">Margin</th>
                                        <th className="px-4 py-3">Expiry</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredItems.map(item => {
                                        const diffDays = getDiffDays(item.expiryDate);
                                        const status = getStatus(item);
                                        const sc = statusConfig[status];
                                        const margin = item.mrp > 0
                                            ? (((item.mrp - item.costPrice) / item.mrp) * 100).toFixed(1)
                                            : '0';

                                        return (
                                            <tr key={item.id} className={cn('hover:bg-muted/40 transition-colors group', sc.rowBg)}>
                                                <td className="px-4 py-3 font-medium">
                                                    {item.name}
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                                                    <div>{item.sku}</div>
                                                    <div className="opacity-60">{item.batchNumber}</div>
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => handleAdjust(item.id, -1)}
                                                            className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-all text-xs font-bold"
                                                        >−</button>
                                                        <span className="font-medium w-12 text-center">
                                                            {item.quantity}
                                                            <span className="text-xs font-normal text-muted-foreground ml-1">{item.unit}</span>
                                                        </span>
                                                        <button
                                                            onClick={() => handleAdjust(item.id, 1)}
                                                            className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-all text-xs font-bold"
                                                        >+</button>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right text-muted-foreground font-mono text-xs">
                                                    {currency}{item.costPrice.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-xs">
                                                    {currency}{item.mrp.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className={cn(
                                                        'text-xs font-semibold',
                                                        parseFloat(margin) > 25 ? 'text-emerald-600' :
                                                            parseFloat(margin) > 10 ? 'text-amber-600' : 'text-red-600'
                                                    )}>
                                                        {margin}%
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    <div className="font-mono text-xs">{item.expiryDate}</div>
                                                    <div className="text-xs text-muted-foreground/70 mt-0.5">
                                                        {diffDays < 0
                                                            ? `${Math.abs(diffDays)}d ago`
                                                            : `in ${diffDays}d`}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', sc.badge)}>
                                                        {sc.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => handleDelete(item.id)}
                                                        disabled={deletingId === item.id}
                                                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600 transition-all disabled:opacity-50"
                                                        title="Delete item"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
