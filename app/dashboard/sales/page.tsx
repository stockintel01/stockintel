'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Minus, Plus, ReceiptText, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { persistSale, type SaleItem } from '@/lib/firebase-utils';
import { cn } from '@/lib/utils';

type CartLine = SaleItem & { available: number };
type PaymentMethod = 'cash' | 'card' | 'upi' | 'credit';

export default function SalesPage() {
    const { organization, user, inventory, currency, taxSettings } = useAppStore();
    const [search, setSearch] = useState('');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
    const [customerName, setCustomerName] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [checkingOut, setCheckingOut] = useState(false);

    const availableItems = useMemo(() => {
        const term = search.trim().toLowerCase();
        return inventory
            .filter(item => item.quantity > 0)
            .filter(item => !term || [item.name, item.sku, item.category, item.batchNumber].some(value => value?.toLowerCase().includes(term)))
            .slice(0, 80);
    }, [inventory, search]);

    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const taxRate = taxSettings.enabled ? taxSettings.rate : 0;
    const taxAmount = subtotal * (taxRate / 100);
    const grandTotal = subtotal + taxAmount;

    function addToCart(itemId: string) {
        const item = inventory.find(entry => entry.id === itemId);
        if (!item || item.quantity <= 0) return;
        setError('');
        setSuccess('');
        setCart(current => {
            const existing = current.find(line => line.itemId === item.id);
            if (existing) {
                return current.map(line => line.itemId === item.id
                    ? { ...line, quantity: Math.min(line.available, line.quantity + 1), total: Math.min(line.available, line.quantity + 1) * line.unitPrice }
                    : line);
            }
            return [...current, {
                itemId: item.id,
                name: item.name,
                sku: item.sku,
                quantity: 1,
                unitPrice: item.mrp,
                total: item.mrp,
                available: item.quantity,
            }];
        });
    }

    function setQuantity(itemId: string, quantity: number) {
        setCart(current => current
            .map(line => {
                if (line.itemId !== itemId) return line;
                const next = Math.max(0, Math.min(line.available, quantity));
                return { ...line, quantity: next, total: next * line.unitPrice };
            })
            .filter(line => line.quantity > 0));
    }

    async function checkout() {
        if (!organization?.id || !user?.id) {
            setError('A signed-in organization is required before checkout.');
            return;
        }
        if (cart.length === 0) {
            setError('Add at least one item to complete a sale.');
            return;
        }
        setCheckingOut(true);
        setError('');
        setSuccess('');
        try {
            const timestamp = new Date().toISOString()
                .replaceAll('-', '')
                .replaceAll(':', '')
                .replaceAll('.', '')
                .replaceAll('T', '')
                .replaceAll('Z', '');
            const billNumber = `INV-${timestamp.slice(0, 14)}`;
            await persistSale(organization.id, {
                organizationId: organization.id,
                billNumber,
                cashierId: user.id,
                cashierName: user.name,
                items: cart.map(line => ({
                    itemId: line.itemId,
                    name: line.name,
                    sku: line.sku,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    total: line.total,
                })),
                subtotal,
                taxRate,
                taxAmount,
                grandTotal,
                paymentMethod,
                customerName: customerName.trim() || undefined,
            });
            setCart([]);
            setCustomerName('');
            setSuccess(`Sale ${billNumber} completed successfully.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
        } finally {
            setCheckingOut(false);
        }
    }

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Sales POS</h1>
                    <p className="text-muted-foreground">Process live inventory sales with stock verification at checkout.</p>
                </div>

                {(error || success) && (
                    <div className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700')}>
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error || success}</span>
                    </div>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Find Items</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Input placeholder="Search product, SKU, category, or batch..." value={search} onChange={event => setSearch(event.target.value)} />
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {availableItems.map(item => (
                                <button key={item.id} onClick={() => addToCart(item.id)} className="rounded-xl border bg-background p-4 text-left transition hover:border-primary hover:shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold leading-tight">{item.name}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">{item.sku} - {item.category}</p>
                                        </div>
                                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{currency}{item.mrp.toFixed(2)}</span>
                                    </div>
                                    <p className="mt-3 text-xs text-muted-foreground">{item.quantity} {item.unit} available</p>
                                </button>
                            ))}
                            {availableItems.length === 0 && (
                                <div className="col-span-full rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                                    No in-stock items match your search.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </section>

            <aside className="lg:sticky lg:top-20 lg:self-start">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Current Sale</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Input placeholder="Customer name (optional)" value={customerName} onChange={event => setCustomerName(event.target.value)} />

                        <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                            {cart.map(line => (
                                <div key={line.itemId} className="rounded-lg border p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-medium">{line.name}</p>
                                            <p className="text-xs text-muted-foreground">{line.sku} - {currency}{line.unitPrice.toFixed(2)}</p>
                                        </div>
                                        <button className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600" onClick={() => setQuantity(line.itemId, 0)}>
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQuantity(line.itemId, line.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                                            <span className="w-8 text-center font-semibold">{line.quantity}</span>
                                            <Button variant="outline" size="icon" className="h-8 w-8" disabled={line.quantity >= line.available} onClick={() => setQuantity(line.itemId, line.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                                        </div>
                                        <p className="font-semibold">{currency}{line.total.toFixed(2)}</p>
                                    </div>
                                </div>
                            ))}
                            {cart.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Cart is empty.</p>}
                        </div>

                        <div className="space-y-2 border-t pt-4 text-sm">
                            <div className="flex justify-between"><span>Subtotal</span><span>{currency}{subtotal.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span>Tax ({taxRate}%)</span><span>{currency}{taxAmount.toFixed(2)}</span></div>
                            <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{currency}{grandTotal.toFixed(2)}</span></div>
                        </div>

                        <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PaymentMethod)}>
                            <option value="cash">Cash</option>
                            <option value="card">Card</option>
                            <option value="upi">Mobile Money / UPI</option>
                            <option value="credit">Credit</option>
                        </select>

                        <Button className="h-11 w-full" disabled={cart.length === 0 || checkingOut} onClick={() => void checkout()}>
                            <ReceiptText className="mr-2 h-4 w-4" />
                            {checkingOut ? 'Completing sale...' : 'Complete Sale'}
                        </Button>
                    </CardContent>
                </Card>
            </aside>
        </div>
    );
}
