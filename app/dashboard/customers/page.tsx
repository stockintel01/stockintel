'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { Users, Search, Phone, Mail, ShoppingBag, TrendingUp, Plus, Loader2, X } from 'lucide-react';
import {
  collection, onSnapshot, addDoc, query,
  orderBy, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  totalOrders: number;
  totalSpend: number;
  lastVisit: string;
  createdAt?: any;
}

export default function CustomersPage() {
  const { currency, organization } = useAppStore();
  const orgId = organization?.id;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    const q = query(
      collection(db, `organizations/${orgId}/customers`),
      orderBy('name')
    );
    const unsub = onSnapshot(q,
      snap => {
        setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
        setLoading(false);
      },
      err => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, [orgId]);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search) ||
    c.id.includes(search)
  );

  const totalRevenue = customers.reduce((s, c) => s + (c.totalSpend ?? 0), 0);
  const totalOrders  = customers.reduce((s, c) => s + (c.totalOrders ?? 0), 0);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !form.name || !form.phone) { setError('Name and phone required'); return; }
    setSaving(true); setError('');
    try {
      await addDoc(collection(db, `organizations/${orgId}/customers`), {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        totalOrders: 0,
        totalSpend: 0,
        lastVisit: new Date().toISOString().slice(0, 10),
        createdAt: serverTimestamp(),
      });
      setForm({ name: '', phone: '', email: '' });
      setShowAdd(false);
    } catch (err: any) {
      setError(err.message || 'Failed to add customer');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">{loading ? 'Loading...' : `${customers.length} registered customers`}</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-2" /> Add Customer</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Customers', value: customers.length, icon: Users, color: 'text-primary' },
          { label: 'Total Orders', value: totalOrders, icon: ShoppingBag, color: 'text-blue-600' },
          { label: 'Total Revenue', value: `${currency}${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Avg Order Value', value: totalOrders > 0 ? `${currency}${Math.round(totalRevenue / totalOrders)}` : '—', icon: TrendingUp, color: 'text-violet-600' },
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
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading customers…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>{customers.length === 0 ? 'No customers yet. Add your first one.' : 'No customers match your search.'}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-y">
                <tr>{['ID','Customer','Contact','Orders','Total Spend','Last Visit'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</div>
                      {c.email && <div className="flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" />{c.email}</div>}
                    </td>
                    <td className="px-4 py-3">{c.totalOrders ?? 0}</td>
                    <td className="px-4 py-3 font-semibold">{currency}{(c.totalSpend ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.lastVisit ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader><CardTitle className="flex items-center justify-between">Add Customer<button onClick={() => setShowAdd(false)}><X className="w-4 h-4" /></button></CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="space-y-3">
                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                <div><label className="text-sm font-medium">Full Name *</label><Input className="mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
                <div><label className="text-sm font-medium">Phone Number *</label><Input className="mt-1" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required /></div>
                <div><label className="text-sm font-medium">Email</label><Input type="email" className="mt-1" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button type="submit" className="flex-1" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Customer'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
