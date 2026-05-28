'use client';

import { useState, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Download, FileText, TrendingUp, Package, DollarSign, Calendar, Sparkles, Brain, Loader2, Copy, RefreshCw } from 'lucide-react';

// Mock data for reports
const salesByCategory = [
    { name: 'Medicine', value: 45000, count: 1250 },
    { name: 'Antibiotic', value: 32000, count: 890 },
    { name: 'Supplement', value: 18000, count: 620 },
    { name: 'Cold & Flu', value: 12000, count: 450 },
    { name: 'Diabetes', value: 8000, count: 280 },
];

const monthlySales = [
    { month: 'Jan', sales: 24000, profit: 8400 },
    { month: 'Feb', sales: 28000, profit: 9800 },
    { month: 'Mar', sales: 32000, profit: 11200 },
    { month: 'Apr', sales: 29000, profit: 10150 },
    { month: 'May', sales: 35000, profit: 12250 },
    { month: 'Jun', sales: 42000, profit: 14700 },
    { month: 'Jul', sales: 45000, profit: 15750 },
];

const topProducts = [
    { name: 'Paracetamol 650mg', sold: 1500, revenue: 3750 },
    { name: 'Amoxicillin 500mg', sold: 890, revenue: 10680 },
    { name: 'Vitamin C 500mg', sold: 620, revenue: 3100 },
    { name: 'Cough Syrup', sold: 450, revenue: 6750 },
    { name: 'Insulin Glargine', sold: 280, revenue: 8400 },
];

const salesByUser = [
    { name: 'Dr. Sarah Wilson', sales: 24500, items: 1120, target: 30000 },
    { name: 'Mike Johnson', sales: 18200, items: 850, target: 20000 },
    { name: 'Emily Davis', sales: 12300, items: 640, target: 15000 },
];


const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function ReportsPage() {
    const { currency } = useAppStore();
    const [dateRange, setDateRange] = useState('year'); // '7d', '30d', '90d', 'year'

    // Filter Logic
    const filteredSales = monthlySales.filter((_, index) => {
        if (dateRange === '7d') return index >= monthlySales.length - 1; // Last month ~ 30 days (mocking 7 days as last entry)
        if (dateRange === '30d') return index >= monthlySales.length - 1; // Last month
        if (dateRange === '90d') return index >= monthlySales.length - 3; // Last 3 months
        return true; // All
    });

    const filteredCategory = salesByCategory.map(cat => ({
        ...cat,
        value: dateRange === 'year' ? cat.value : Math.floor(cat.value * (dateRange === '90d' ? 0.4 : 0.15)) // Mock reduction
    }));

    const downloadReport = (type: string) => {
        let csvContent = '';
        let filename = '';

        switch (type) {
            case 'Sales':
                // Generate sales report CSV
                csvContent = [
                    ['Month', 'Sales', 'Profit', 'Margin %'],
                    ...monthlySales.map(m => [m.month, m.sales, m.profit, ((m.profit / m.sales) * 100).toFixed(1) + '%'])
                ].map(row => row.join(',')).join('\n');
                filename = 'sales_report.csv';
                break;

            case 'Inventory':
                // Generate inventory report CSV
                csvContent = [
                    ['Product Name', 'Units Sold', 'Revenue', 'Avg Price'],
                    ...topProducts.map(p => [p.name, p.sold, p.revenue, (p.revenue / p.sold).toFixed(2)])
                ].map(row => row.join(',')).join('\n');
                filename = 'inventory_report.csv';
                break;

            case 'Daily Sales':
                // Generate daily sales summary
                csvContent = [
                    ['Metric', 'Value'],
                    ['Total Sales', '45000'],
                    ['Total Profit', '15750'],
                    ['Items Sold', '3740'],
                    ['Avg Order Value', '425']
                ].map(row => row.join(',')).join('\n');
                filename = 'daily_sales_report.csv';
                break;

            case 'Stock Valuation':
                // Generate stock valuation report
                csvContent = [
                    ['Category', 'Sales Value', 'Item Count'],
                    ...salesByCategory.map(c => [c.name, c.value, c.count])
                ].map(row => row.join(',')).join('\n');
                filename = 'stock_valuation_report.csv';
                break;

            case 'Profit & Loss':
                // Generate P&L statement
                const totalSales = monthlySales.reduce((sum, m) => sum + m.sales, 0);
                const totalProfit = monthlySales.reduce((sum, m) => sum + m.profit, 0);
                csvContent = [
                    ['Period', new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })],
                    ['Total Revenue', totalSales],
                    ['Total Profit', totalProfit],
                    ['Profit Margin', ((totalProfit / totalSales) * 100).toFixed(1) + '%'],
                    [''],
                    ['Monthly Breakdown', ''],
                    ['Month', 'Sales', 'Profit'],
                    ...monthlySales.map(m => [m.month, m.sales, m.profit])
                ].map(row => row.join(',')).join('\n');
                filename = 'profit_loss_report.csv';
                break;

            default:
                return;
        }

        // Create and download CSV file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
                    <p className="text-muted-foreground">Comprehensive business insights and data exports</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Date Range Filter */}
                    <div className="flex items-center border rounded-md p-1 bg-muted/50 mr-2">
                        {['7d', '30d', '90d', 'year'].map((range) => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-all ${dateRange === range
                                    ? 'bg-background shadow-sm text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {range === 'year' ? 'This Year' : `Last ${range.replace('d', ' Days')}`}
                            </button>
                        ))}
                    </div>

                    <Button variant="outline" size="sm" onClick={() => downloadReport('Sales')}>
                        <Download className="w-4 h-4 mr-2" />
                        Sales CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadReport('Inventory')}>
                        <Download className="w-4 h-4 mr-2" />
                        Inventory CSV
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Sales (Month)</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{currency}45,000</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-500">+12.5%</span> from last month
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{currency}15,750</div>
                        <p className="text-xs text-muted-foreground">35% margin</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">3,740</div>
                        <p className="text-xs text-muted-foreground">This month</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{currency}425</div>
                        <p className="text-xs text-muted-foreground">
                            <span className="text-green-500">+8%</span> increase
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Sales Trend */}
                <Card className="col-span-2">
                    <CardHeader>
                        <CardTitle>Sales & Profit Trend</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={monthlySales}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="month"
                                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                                />
                                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--background))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '8px'
                                    }}
                                />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="sales"
                                    stroke="#0088FE"
                                    strokeWidth={2}
                                    name="Sales"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="profit"
                                    stroke="#00C49F"
                                    strokeWidth={2}
                                    name="Profit"
                                />
                            </LineChart>
                        </ResponsiveContainer>

                        {/* Insight Card */}
                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">📊 Analysis</h4>
                            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                                Sales show consistent upward growth from ₹24,000 (Jan) to ₹45,000 (Jul), representing an 87.5% increase.
                                Profit margin remains stable at ~35%, indicating healthy pricing and cost control.
                            </p>
                            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">💡 Recommendations</h4>
                            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                                <li>Maintain current growth trajectory by focusing on high-margin products</li>
                                <li>Investigate April dip (₹29K) to prevent future seasonal drops</li>
                                <li>Consider expanding inventory for peak months (Jun-Jul)</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>

                {/* Category Distribution */}
                <Card className="col-span-2">
                    <CardHeader>
                        <CardTitle>Sales by Category</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={salesByCategory}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {salesByCategory.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--background))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '8px'
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>

                        {/* Insight Card */}
                        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                            <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">📊 Analysis</h4>
                            <p className="text-sm text-green-800 dark:text-green-200 mb-3">
                                Medicine category dominates with 39% of total sales (₹45K), followed by Antibiotics at 28% (₹32K).
                                Top 3 categories account for 82% of revenue, showing concentrated demand.
                            </p>
                            <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">💡 Recommendations</h4>
                            <ul className="text-sm text-green-800 dark:text-green-200 space-y-1 list-disc list-inside">
                                <li>Prioritize stock levels for Medicine and Antibiotic categories</li>
                                <li>Explore growth opportunities in underperforming categories (Diabetes: 7%)</li>
                                <li>Consider promotional campaigns for Supplements to boost sales</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Top Products */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Top Selling Products</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="p-3 text-left font-medium">Product</th>
                                        <th className="p-3 text-right font-medium">Sold</th>
                                        <th className="p-3 text-right font-medium">Revenue</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {topProducts.map((product, index) => (
                                        <tr key={index} className="hover:bg-muted/50">
                                            <td className="p-3 font-medium">{product.name}</td>
                                            <td className="p-3 text-right">{product.sold}</td>
                                            <td className="p-3 text-right font-medium">{currency}{product.revenue.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Sales by Staff Member</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="p-3 text-left font-medium">Staff</th>
                                        <th className="p-3 text-right font-medium">Items</th>
                                        <th className="p-3 text-right font-medium">Revenue</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {salesByUser.map((staff, index) => (
                                        <tr key={index} className="hover:bg-muted/50">
                                            <td className="p-3 font-medium text-blue-600">{staff.name}</td>
                                            <td className="p-3 text-right">{staff.items}</td>
                                            <td className="p-3 text-right font-bold">{currency}{staff.sales.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 space-y-4">
                            {salesByUser.map((staff, index) => (
                                <div key={index} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span>{staff.name} (Progress to target)</span>
                                        <span>{((staff.sales / staff.target) * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary"
                                            style={{ width: `${(staff.sales / staff.target) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>


            {/* AI Report Generator — Claude-in-Claude */}
            <Suspense fallback={
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading AI Report Generator…
                </div>
            }>
                <AiReportGenerator />
            </Suspense>
        </div>
    );
}

// ─── AI Report Generator component ───────────────────────────────────────────

const REPORT_PROMPTS = [
    { label: 'Daily Sales Summary',      prompt: 'Generate a concise daily sales summary with key metrics, top-selling items, revenue breakdown, and actionable recommendations.' },
    { label: 'Stock Valuation Report',   prompt: 'Generate a stock valuation report covering total inventory value, category breakdown, items at risk (expiring/low stock), and reorder recommendations.' },
    { label: 'Profit & Loss Analysis',   prompt: 'Generate a profit and loss analysis including gross margin by category, highest and lowest margin products, and suggestions to improve profitability.' },
    { label: 'Expiry Risk Report',       prompt: 'Generate an expiry risk report listing items expiring within 30, 60, and 90 days with estimated write-off values and suggested actions.' },
    { label: 'Reorder Recommendations',  prompt: 'Generate a reorder recommendations report identifying which items need restocking, suggested order quantities, and priority levels.' },
    { label: 'Category Performance',     prompt: 'Generate a category performance report ranking all product categories by revenue, units sold, margin, and growth trend.' },
];

function AiReportGenerator() {
    const { inventory, currency, activeIndustry, organization } = useAppStore();
    const [selectedPrompt, setSelectedPrompt] = useState(REPORT_PROMPTS[0]);
    const [customPrompt, setCustomPrompt]     = useState('');
    const [report, setReport]                 = useState('');
    const [loading, setLoading]               = useState(false);
    const [copied, setCopied]                 = useState(false);
    const [error, setError]                   = useState('');

    const inventorySummary = {
        totalItems:    inventory.length,
        totalValue:    inventory.reduce((s, i) => s + i.mrp * i.quantity, 0),
        totalCost:     inventory.reduce((s, i) => s + i.costPrice * i.quantity, 0),
        lowStock:      inventory.filter(i => i.quantity < 50).length,
        outOfStock:    inventory.filter(i => i.quantity === 0).length,
        expiringSoon:  inventory.filter(i => {
            const days = Math.ceil((new Date(i.expiryDate).getTime() - Date.now()) / 86400000);
            return days >= 0 && days <= 30;
        }).length,
        categories:    [...new Set(inventory.map(i => i.category))],
        topItems:      [...inventory].sort((a, b) => b.mrp * b.quantity - a.mrp * a.quantity).slice(0, 10),
    };

    const generateReport = async () => {
        setLoading(true); setReport(''); setError('');
        const finalPrompt = customPrompt.trim() || selectedPrompt.prompt;

        try {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1500,
                    system: `You are a business intelligence analyst for an ${activeIndustry} business called "${organization?.name ?? 'IntelliStock'}". 
Generate clear, professional, markdown-formatted reports based on the inventory data provided.
Use headings, bullet points, and tables where appropriate. Be specific with numbers. Keep it under 600 words.`,
                    messages: [{
                        role: 'user',
                        content: `${finalPrompt}

Current inventory snapshot (${new Date().toLocaleDateString()}):
- Total items: ${inventorySummary.totalItems}
- Total stock value (MRP): ${currency}${inventorySummary.totalValue.toLocaleString()}
- Total cost value: ${currency}${inventorySummary.totalCost.toLocaleString()}
- Gross margin: ${inventorySummary.totalValue > 0 ? (((inventorySummary.totalValue - inventorySummary.totalCost) / inventorySummary.totalValue) * 100).toFixed(1) : 0}%
- Low stock items (< 50 units): ${inventorySummary.lowStock}
- Out of stock: ${inventorySummary.outOfStock}
- Expiring within 30 days: ${inventorySummary.expiringSoon}
- Categories: ${inventorySummary.categories.join(', ')}

Top 10 items by value:
${inventorySummary.topItems.map(i =>
    `- ${i.name}: ${i.quantity} units × ${currency}${i.mrp} = ${currency}${(i.quantity * i.mrp).toLocaleString()} | Category: ${i.category} | Expiry: ${i.expiryDate}`
).join('\n')}`,
                    }],
                }),
            });

            if (!res.ok) throw new Error(`API error ${res.status}`);
            const data = await res.json();
            setReport(data.content?.[0]?.text ?? 'No report generated.');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Report generation failed. Check your ANTHROPIC_API_KEY.');
        } finally {
            setLoading(false);
        }
    };

    const copyReport = () => {
        navigator.clipboard.writeText(report);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadReport = () => {
        const blob = new Blob([report], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${selectedPrompt.label.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-primary" /> AI Report Generator
                    <span className="text-xs font-normal text-muted-foreground ml-1">powered by Claude</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                {/* Prompt chips */}
                <div className="flex flex-wrap gap-2">
                    {REPORT_PROMPTS.map(p => (
                        <button key={p.label} onClick={() => { setSelectedPrompt(p); setCustomPrompt(''); }}
                            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                                selectedPrompt.label === p.label && !customPrompt
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
                            }`}>
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Custom prompt */}
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Or write a custom prompt
                    </label>
                    <textarea
                        className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                        placeholder="e.g. Which items should I discount this month to clear expiring stock?"
                        value={customPrompt}
                        onChange={e => setCustomPrompt(e.target.value)}
                    />
                </div>

                <Button className="gap-2" onClick={generateReport} disabled={loading}>
                    {loading
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                        : <><Sparkles className="w-4 h-4" />Generate Report</>}
                </Button>

                {error && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                        <span className="shrink-0">⚠</span> {error}
                    </div>
                )}

                {/* Report output */}
                {report && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{customPrompt || selectedPrompt.label}</p>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={copyReport}>
                                    <Copy className="w-3 h-3" />{copied ? 'Copied!' : 'Copy'}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={downloadReport}>
                                    <Download className="w-3 h-3" />Download .md
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={generateReport} disabled={loading}>
                                    <RefreshCw className="w-3 h-3" />Regenerate
                                </Button>
                            </div>
                        </div>
                        <div className="border rounded-xl bg-muted/30 p-5 text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none overflow-y-auto max-h-[500px]">
                            <pre className="whitespace-pre-wrap font-sans text-sm">{report}</pre>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
