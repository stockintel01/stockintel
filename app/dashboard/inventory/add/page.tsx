'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

export default function AddInventoryPage() {
    const router = useRouter();
    const { activeIndustry, currency, addInventoryItem } = useAppStore();
    const [isLoading, setIsLoading] = useState(false);

    // Controlled form state — all fields wired up so data actually saves
    const [name, setName] = useState('');
    const [sku, setSku] = useState('');
    const [category, setCategory] = useState('');
    const [unit, setUnit] = useState('');
    const [costPrice, setCostPrice] = useState('');
    const [sellingPrice, setSellingPrice] = useState('');
    const [batchNumber, setBatchNumber] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [quantity, setQuantity] = useState('');
    const [location, setLocation] = useState('');

    const calculateMargin = () => {
        const cost = parseFloat(costPrice);
        const sell = parseFloat(sellingPrice);
        if (!cost || !sell || sell === 0) return '0';
        return (((sell - cost) / sell) * 100).toFixed(1);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Build new item and persist it in Zustand store (survives navigation)
        const newItem = {
            id: `item_${Date.now()}`,
            name: name.trim(),
            sku: sku.trim() || `SKU-${Date.now()}`,
            batchNumber: batchNumber.trim(),
            expiryDate,
            quantity: parseInt(quantity) || 0,
            unit: unit.trim() || 'Units',
            mrp: parseFloat(sellingPrice) || 0,
            costPrice: parseFloat(costPrice) || 0,
            category: category.trim() || 'General',
            location: location.trim() || 'Main Store',
        };

        addInventoryItem(newItem);

        await new Promise(resolve => setTimeout(resolve, 600));
        router.push('/dashboard/inventory');
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/dashboard/inventory">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold tracking-tight">Add New Item</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Item Details ({activeIndustry || 'Loading...'})</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-8">

                        {/* Basic Details */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Basic Information</h3>
                            <div className="grid gap-6 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Item Name <span className="text-red-500">*</span></Label>
                                    <Input id="name" placeholder="e.g. Paracetamol 650mg, Urea Fertilizer"
                                        value={name} onChange={(e) => setName(e.target.value)} required />
                                    <p className="text-[0.8rem] text-muted-foreground">Full commercial name as it appears on packaging.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="sku">SKU / Item Code</Label>
                                    <Input id="sku" placeholder="e.g. PCM-650-TAB"
                                        value={sku} onChange={(e) => setSku(e.target.value)} />
                                    <p className="text-[0.8rem] text-muted-foreground">Unique identifier for scanning and tracking.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="category">Category</Label>
                                    <Input id="category" placeholder="e.g. Medicine, Antibiotic, Fertilizer"
                                        value={category} onChange={(e) => setCategory(e.target.value)} />
                                    <p className="text-[0.8rem] text-muted-foreground">Group items for easier reporting.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="unit">Unit of Measure</Label>
                                    <Input id="unit" placeholder="e.g. Strip, Tablet, Bottle, Bags, kg"
                                        value={unit} onChange={(e) => setUnit(e.target.value)} />
                                    <p className="text-[0.8rem] text-muted-foreground">How is this item sold?</p>
                                </div>
                            </div>
                        </div>

                        {/* Pricing */}
                        <div className="space-y-4 border-t pt-6">
                            <h3 className="text-lg font-medium flex items-center gap-2">
                                Pricing & Profit
                                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded-full">
                                    Margin: {calculateMargin()}%
                                </span>
                            </h3>
                            <div className="grid gap-6 sm:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="cost">Buying Price (Cost) <span className="text-red-500">*</span></Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-muted-foreground">{currency}</span>
                                        <Input id="cost" type="number" step="0.01" className="pl-7"
                                            value={costPrice} onChange={(e) => setCostPrice(e.target.value)} required />
                                    </div>
                                    <p className="text-[0.8rem] text-muted-foreground">Rate purchased from supplier.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="mrp">Selling Price (MRP) <span className="text-red-500">*</span></Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-muted-foreground">{currency}</span>
                                        <Input id="mrp" type="number" step="0.01" className="pl-7"
                                            value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} required />
                                    </div>
                                    <p className="text-[0.8rem] text-muted-foreground">Maximum Retail Price including taxes.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="tax">Tax Rate (%)</Label>
                                    <Input id="tax" type="number" defaultValue="18" />
                                    <p className="text-[0.8rem] text-muted-foreground">GST/VAT percentage applicable.</p>
                                </div>
                            </div>
                        </div>

                        {/* Stock */}
                        <div className="space-y-4 border-t pt-6">
                            <h3 className="text-lg font-medium">Inventory & Tracking</h3>
                            <div className="grid gap-6 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="batch">Batch Number <span className="text-red-500">*</span></Label>
                                    <Input id="batch" placeholder="e.g. B-2024-001"
                                        value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} required />
                                    <p className="text-[0.8rem] text-muted-foreground">Production batch for tracking expiration and recalls.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="expiry">Expiry Date <span className="text-red-500">*</span></Label>
                                    <Input id="expiry" type="date"
                                        value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required />
                                    <p className="text-[0.8rem] text-muted-foreground">Item will be flagged &apos;Expiring Soon&apos; 30 days prior.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="qty">Opening Stock <span className="text-red-500">*</span></Label>
                                    <Input id="qty" type="number" placeholder="0"
                                        value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
                                    <p className="text-[0.8rem] text-muted-foreground">Current quantity on hand.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="location">Storage Location</Label>
                                    <Input id="location" placeholder="e.g. Shelf A-2"
                                        value={location} onChange={(e) => setLocation(e.target.value)} />
                                    <p className="text-[0.8rem] text-muted-foreground">Where is this item physically stored?</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-6">
                            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                            <Button type="submit" disabled={isLoading} size="lg">
                                <Save className="w-4 h-4 mr-2" />
                                {isLoading ? 'Saving Item...' : 'Save Inventory Item'}
                            </Button>
                        </div>

                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
