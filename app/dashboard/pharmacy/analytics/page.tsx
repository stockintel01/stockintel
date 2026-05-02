'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { TrendingUp, TrendingDown, AlertTriangle, Package, Calendar, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Mock data for drug performance
const DRUG_PERFORMANCE = [
    {
        id: 1,
        name: 'Paracetamol 650mg',
        sku: 'PCM-650',
        currentStock: 1500,
        avgDailySales: 45,
        trend: 'up',
        trendPercent: 12,
        daysUntilStockout: 33,
        reorderPoint: 500,
        status: 'healthy',
        lastMonthSales: 1350,
        thisMonthSales: 1512,
        category: 'Pain Relief'
    },
    {
        id: 2,
        name: 'Amoxicillin 500mg',
        sku: 'AMX-500',
        currentStock: 300,
        avgDailySales: 28,
        trend: 'up',
        trendPercent: 8,
        daysUntilStockout: 11,
        reorderPoint: 400,
        status: 'warning',
        lastMonthSales: 780,
        thisMonthSales: 842,
        category: 'Antibiotic'
    },
    {
        id: 3,
        name: 'Vitamin C 500mg',
        sku: 'VIT-C-500',
        currentStock: 800,
        avgDailySales: 15,
        trend: 'down',
        trendPercent: -5,
        daysUntilStockout: 53,
        reorderPoint: 300,
        status: 'healthy',
        lastMonthSales: 495,
        thisMonthSales: 470,
        category: 'Supplement'
    },
    {
        id: 4,
        name: 'Cough Syrup 100ml',
        sku: 'CS-100',
        currentStock: 85,
        avgDailySales: 22,
        trend: 'up',
        trendPercent: 25,
        daysUntilStockout: 4,
        reorderPoint: 150,
        status: 'critical',
        lastMonthSales: 528,
        thisMonthSales: 660,
        category: 'Cold & Flu'
    },
    {
        id: 5,
        name: 'Insulin Glargine',
        sku: 'INS-GL',
        currentStock: 120,
        avgDailySales: 8,
        trend: 'stable',
        trendPercent: 0,
        daysUntilStockout: 15,
        reorderPoint: 100,
        status: 'warning',
        lastMonthSales: 240,
        thisMonthSales: 240,
        category: 'Diabetes'
    }
];

export default function DrugAnalyticsPage() {
    const { currency } = useAppStore();
    const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'healthy'>('all');

    const filteredDrugs = filter === 'all'
        ? DRUG_PERFORMANCE
        : DRUG_PERFORMANCE.filter(drug => drug.status === filter);

    const criticalCount = DRUG_PERFORMANCE.filter(d => d.status === 'critical').length;
    const warningCount = DRUG_PERFORMANCE.filter(d => d.status === 'warning').length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Drug Performance Analytics</h1>
                <p className="text-muted-foreground">Track sales trends and predict restocking needs</p>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Critical Items</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
                        <p className="text-xs text-muted-foreground">Restock within 7 days</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Warning Items</CardTitle>
                        <Package className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">{warningCount}</div>
                        <p className="text-xs text-muted-foreground">Monitor closely</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Sales Velocity</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">23.6</div>
                        <p className="text-xs text-muted-foreground">units/day across all drugs</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Restock Orders Due</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">2</div>
                        <p className="text-xs text-muted-foreground">This week</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                <Button
                    variant={filter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('all')}
                >
                    All Drugs
                </Button>
                <Button
                    variant={filter === 'critical' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('critical')}
                    className={filter === 'critical' ? 'bg-red-600 hover:bg-red-700' : ''}
                >
                    Critical ({criticalCount})
                </Button>
                <Button
                    variant={filter === 'warning' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('warning')}
                    className={filter === 'warning' ? 'bg-amber-600 hover:bg-amber-700' : ''}
                >
                    Warning ({warningCount})
                </Button>
                <Button
                    variant={filter === 'healthy' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('healthy')}
                >
                    Healthy
                </Button>
            </div>

            {/* Performance Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        Drug Performance & Predictions
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="p-3 text-left font-medium">Drug Name</th>
                                    <th className="p-3 text-left font-medium">Category</th>
                                    <th className="p-3 text-right font-medium">Current Stock</th>
                                    <th className="p-3 text-right font-medium">Avg Daily Sales</th>
                                    <th className="p-3 text-center font-medium">Trend</th>
                                    <th className="p-3 text-right font-medium">Days Until Stockout</th>
                                    <th className="p-3 text-center font-medium">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredDrugs.map((drug) => (
                                    <tr key={drug.id} className={cn(
                                        "hover:bg-muted/50",
                                        drug.status === 'critical' && "bg-red-50 dark:bg-red-950/20",
                                        drug.status === 'warning' && "bg-amber-50 dark:bg-amber-950/20"
                                    )}>
                                        <td className="p-3">
                                            <div>
                                                <div className="font-medium">{drug.name}</div>
                                                <div className="text-xs text-muted-foreground">{drug.sku}</div>
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <span className="text-xs bg-muted px-2 py-1 rounded">{drug.category}</span>
                                        </td>
                                        <td className="p-3 text-right font-medium">{drug.currentStock}</td>
                                        <td className="p-3 text-right">{drug.avgDailySales} units/day</td>
                                        <td className="p-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                {drug.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-600" />}
                                                {drug.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-600" />}
                                                {drug.trend === 'stable' && <span className="text-gray-500">—</span>}
                                                <span className={cn(
                                                    "text-xs font-medium",
                                                    drug.trend === 'up' && "text-green-600",
                                                    drug.trend === 'down' && "text-red-600"
                                                )}>
                                                    {drug.trendPercent > 0 ? '+' : ''}{drug.trendPercent}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className={cn(
                                                "font-bold",
                                                drug.daysUntilStockout <= 7 && "text-red-600",
                                                drug.daysUntilStockout > 7 && drug.daysUntilStockout <= 14 && "text-amber-600",
                                                drug.daysUntilStockout > 14 && "text-green-600"
                                            )}>
                                                {drug.daysUntilStockout} days
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Reorder at {drug.reorderPoint}
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            {drug.status === 'critical' && (
                                                <Button size="sm" className="bg-red-600 hover:bg-red-700">
                                                    Restock Now
                                                </Button>
                                            )}
                                            {drug.status === 'warning' && (
                                                <Button size="sm" variant="outline" className="border-amber-600 text-amber-600">
                                                    Plan Restock
                                                </Button>
                                            )}
                                            {drug.status === 'healthy' && (
                                                <Button size="sm" variant="ghost">
                                                    View Details
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Insights */}
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
                <CardHeader>
                    <CardTitle className="text-blue-900 dark:text-blue-100">AI Insights & Recommendations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-blue-900 dark:text-blue-100">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p><strong>Urgent:</strong> Cough Syrup stock critically low (4 days remaining). Immediate reorder recommended for 500 units.</p>
                    </div>
                    <div className="flex items-start gap-2">
                        <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p><strong>Trending:</strong> Amoxicillin sales increased 8% this month. Consider increasing reorder quantity from 500 to 600 units.</p>
                    </div>
                    <div className="flex items-start gap-2">
                        <Package className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p><strong>Optimization:</strong> Vitamin C showing declining trend (-5%). Review pricing or promotional strategy.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
