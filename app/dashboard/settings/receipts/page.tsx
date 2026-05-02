'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Scroll, Printer, ALargeSmall, ReceiptText } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function ReceiptDesignerPage() {
    const { receiptSettings, updateReceiptSettings, user } = useAppStore();

    // Local state for preview if needed, but we can stick to store for simplicity since it persists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpdate = (key: string, value: any) => {
        updateReceiptSettings({ [key]: value });
    };

    return (
        <div className="grid lg:grid-cols-2 gap-8 h-[calc(100vh-8rem)]">

            {/* Controls */}
            <div className="space-y-6 overflow-y-auto pr-2">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Receipt Designer</h1>
                    <p className="text-muted-foreground">Customize your invoice layout and branding.</p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Template Style</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-3 gap-4">
                        {(['thermal', 'a4', 'minimal'] as const).map((t) => (
                            <div
                                key={t}
                                onClick={() => handleUpdate('template', t)}
                                className={cn(
                                    "cursor-pointer border-2 rounded-lg p-4 flex flex-col items-center gap-2 hover:bg-muted/50 transition-all",
                                    receiptSettings.template === t ? "border-primary bg-primary/5" : "border-transparent bg-muted"
                                )}
                            >
                                {t === 'thermal' && <Scroll className="w-8 h-8" />}
                                {t === 'a4' && <ReceiptText className="w-8 h-8" />}
                                {t === 'minimal' && <ALargeSmall className="w-8 h-8" />}
                                <span className="text-sm font-medium capitalize">{t}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Business Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Business Name</Label>
                            <Input
                                value={receiptSettings.businessName}
                                onChange={(e) => handleUpdate('businessName', e.target.value)}
                                placeholder="Your Company Name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Address</Label>
                            <Input
                                value={receiptSettings.address}
                                onChange={(e) => handleUpdate('address', e.target.value)}
                                placeholder="123 Market Street, City, Country"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Phone Number</Label>
                                <Input
                                    value={receiptSettings.phone}
                                    onChange={(e) => handleUpdate('phone', e.target.value)}
                                    placeholder="+1 234 567 890"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input
                                    value={receiptSettings.email}
                                    onChange={(e) => handleUpdate('email', e.target.value)}
                                    placeholder="contact@company.com"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Tax ID / GSTIN</Label>
                            <Input
                                value={receiptSettings.taxId}
                                onChange={(e) => handleUpdate('taxId', e.target.value)}
                                placeholder="29AAAAA0000A1Z5"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Footer / Thank You Note</Label>
                            <Input
                                value={receiptSettings.footerText}
                                onChange={(e) => handleUpdate('footerText', e.target.value)}
                                placeholder="Thank you for your business!"
                            />
                        </div>
                        <div className="flex items-center gap-2 p-2 border rounded">
                            <input
                                type="checkbox"
                                checked={receiptSettings.showLogo}
                                onChange={(e) => handleUpdate('showLogo', e.target.checked)}
                                id="showLogo"
                                className="w-4 h-4"
                            />
                            <label htmlFor="showLogo" className="text-sm font-medium">Show Logo on Receipt</label>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex gap-4">
                    <Button className="flex-1" onClick={() => window.print()}>
                        <Printer className="w-4 h-4 mr-2" /> Test Print
                    </Button>
                    <Link href="/dashboard/settings" className="flex-1">
                        <Button variant="outline" className="w-full">Back to Settings</Button>
                    </Link>
                </div>
            </div>

            {/* Live Preview */}
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-xl p-8 flex items-start justify-center overflow-y-auto border shadow-inner">

                <div
                    className={cn(
                        "bg-white text-black shadow-lg p-6 transition-all duration-500 origin-top",
                        receiptSettings.template === 'thermal' ? "w-[300px] text-xs min-h-[500px]" : "",
                        receiptSettings.template === 'a4' ? "w-[500px] text-sm h-[700px]" : "",
                        receiptSettings.template === 'minimal' ? "w-[400px] text-sm font-mono border-2 border-dashed border-black p-8" : ""
                    )}
                >
                    {/* Header */}
                    <div className="text-center mb-6 border-b pb-4 border-black/10">
                        {receiptSettings.showLogo && (
                            <div className="w-12 h-12 bg-black text-white rounded-lg flex items-center justify-center mx-auto mb-2 font-bold text-xl">
                                IS
                            </div>
                        )}
                        <h2 className="font-bold text-xl uppercase tracking-wider">{receiptSettings.businessName || 'Business Name'}</h2>
                        <p className="text-gray-500 mt-1">{receiptSettings.address || '123 Market Street, City, Country'}</p>
                        {receiptSettings.phone && <p className="text-gray-500">Tel: {receiptSettings.phone}</p>}
                        {receiptSettings.email && <p className="text-gray-500 text-xs">{receiptSettings.email}</p>}
                        {receiptSettings.taxId && <div className="mt-2 text-xs text-gray-400">GSTIN: {receiptSettings.taxId}</div>}
                    </div>

                    {/* Bill Meta */}
                    <div className="flex justify-between mb-4 border-b pb-2 border-black/10 text-gray-600">
                        <div>
                            <div>Bill #: 10023</div>
                            <div>Date: {new Date().toLocaleDateString()}</div>
                        </div>
                        <div className="text-right">
                            <div>User: {user?.name || 'Admin'}</div>
                            <div>Time: {new Date().toLocaleTimeString()}</div>
                        </div>
                    </div>

                    {/* Items */}
                    <table className="w-full text-left mb-6">
                        <thead>
                            <tr className="border-b border-black">
                                <th className="py-1">Item</th>
                                <th className="py-1 text-center">Qty</th>
                                <th className="py-1 text-right">Price</th>
                                <th className="py-1 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-800">
                            <tr>
                                <td className="py-1">Paracetamol 650mg</td>
                                <td className="text-center">2</td>
                                <td className="text-right">2.50</td>
                                <td className="text-right font-medium">5.00</td>
                            </tr>
                            <tr>
                                <td className="py-1">Amoxicillin 500mg</td>
                                <td className="text-center">1</td>
                                <td className="text-right">12.00</td>
                                <td className="text-right font-medium">12.00</td>
                            </tr>
                            <tr>
                                <td className="py-1">Vitamin C Strip</td>
                                <td className="text-center">5</td>
                                <td className="text-right">5.00</td>
                                <td className="text-right font-medium">25.00</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Totals */}
                    <div className="flex flex-col items-end gap-1 border-t pt-4 border-black mb-6">
                        <div className="flex justify-between w-40 text-gray-600">
                            <span>Subtotal:</span>
                            <span>42.00</span>
                        </div>
                        <div className="flex justify-between w-40 text-gray-600">
                            <span>Tax (18%):</span>
                            <span>7.56</span>
                        </div>
                        <div className="flex justify-between w-40 font-bold text-lg mt-2 pt-2 border-t border-black/20">
                            <span>Total:</span>
                            <span>49.56</span>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center mt-auto pt-6 text-gray-500">
                        <p className="mb-2 italic">&quot;{receiptSettings.footerText}&quot;</p>
                        <div className="text-[10px] uppercase tracking-widest mt-4">Powered by IntelliStock AI</div>
                        {receiptSettings.template === 'thermal' && (
                            <div className="mt-4 border-t border-dashed border-gray-400 pt-2">
                                * * * * *
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
