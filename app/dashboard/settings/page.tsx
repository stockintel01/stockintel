'use client';

import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Globe, Lock, Scroll } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { doc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';

export default function SettingsPage() {
    const { user, organization, currency, setCurrency, taxSettings, updateTaxSettings, setStoreUser } = useAppStore();
    const [successMsg, setSuccessMsg] = useState('');
    const [name, setName] = useState(user?.name ?? '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!user || !auth.currentUser) return;
        setSaving(true);
        try {
            await Promise.all([
                updateProfile(auth.currentUser, { displayName: name.trim() }),
                updateDoc(doc(db, 'users', user.id), { displayName: name.trim(), updatedAt: new Date() }),
                organization?.id ? updateDoc(doc(db, 'organizations', organization.id), {
                    currency,
                    settings: { tax: taxSettings },
                    updatedAt: new Date(),
                }) : Promise.resolve(),
            ]);
            setStoreUser({ ...user, name: name.trim() }, organization);
            setSuccessMsg('Settings saved!');
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch { setSuccessMsg('Failed to save. Try again.'); }
        finally { setSaving(false); }
    };

    return (
        <div className="max-w-4xl space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">Manage your profile, preferences, and workspace settings.</p>
            </div>

            <div className="grid gap-8">
                {/* Profile Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="w-5 h-5" /> Profile Settings
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input value={name} onChange={event => setName(event.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Email Address</Label>
                                <Input defaultValue={user?.email} disabled className="bg-muted" />
                            </div>
                        </div>
                        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
                    </CardContent>
                </Card>

                {/* Preferences Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="w-5 h-5" /> Globalization
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2 max-w-xs">
                            <Label>Currency Symbol</Label>
                            <div className="flex gap-2">
                                {['GHS', '₵', '$', '€', '£', '₦', '₹', 'KSh'].map((sym) => (
                                    <Button
                                        key={sym}
                                        variant={currency === sym ? "default" : "outline"}
                                        className="w-12 h-12 text-lg"
                                        onClick={() => setCurrency(sym)}
                                    >
                                        {sym}
                                    </Button>
                                ))}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                Selected: <span className="font-bold">{currency}</span> (Rupee/Dollar/Euro/Pound/Cedi)
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Tax Configuration Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="w-5 h-5" /> Tax Configuration
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div>
                                <Label className="text-base font-medium">Enable Tax</Label>
                                <p className="text-sm text-muted-foreground">Apply tax to all sales transactions</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={taxSettings.enabled}
                                onChange={(e) => updateTaxSettings({ enabled: e.target.checked })}
                                className="w-5 h-5 cursor-pointer"
                            />
                        </div>
                        {taxSettings.enabled && (
                            <div className="space-y-2 max-w-xs">
                                <Label>Tax Rate (%)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={taxSettings.rate}
                                    onChange={(e) => updateTaxSettings({ rate: parseFloat(e.target.value) || 0 })}
                                />
                                <p className="text-sm text-muted-foreground">
                                    Current rate: <span className="font-bold">{taxSettings.rate}%</span>
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Receipt Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Scroll className="w-5 h-5" /> Receipt & Billing
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">Customize invoice templates, logos, and footer messages.</p>
                        <Link href="/dashboard/settings/receipts">
                            <Button variant="outline" className="w-full">Open Receipt Designer</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* Security Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5" /> Security
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button variant="outline">Change Password</Button>
                        <Button variant="outline" className="ml-2 text-red-600 hover:text-red-600 hover:bg-red-50">Log out all devices</Button>
                    </CardContent>
                </Card>
            </div>

            {successMsg && (
                <div className="fixed bottom-8 right-8 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg animate-in slide-in-from-bottom">
                    {successMsg}
                </div>
            )}
        </div>
    );
}
