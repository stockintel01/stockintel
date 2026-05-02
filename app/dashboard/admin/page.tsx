'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Settings, DollarSign, Globe, Shield } from 'lucide-react';

interface SuperAdminConfig {
    subscriptionPricing: {
        baseUSD: number;
        proPlanMultiplier: number;
        enterprisePlanMultiplier: number;
    };
    features: {
        maxWorkersFreeTrial: number;
        maxWorkersPro: number;
        maxWorkersEnterprise: number;
    };
}

export default function SuperAdminPage() {
    const { user } = useAppStore();
    const [config, setConfig] = useState<SuperAdminConfig>({
        subscriptionPricing: {
            baseUSD: 5,
            proPlanMultiplier: 1,
            enterprisePlanMultiplier: 3
        },
        features: {
            maxWorkersFreeTrial: 3,
            maxWorkersPro: 20,
            maxWorkersEnterprise: 999
        }
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            const docRef = doc(db, 'system', 'config');
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                setConfig(snap.data() as SuperAdminConfig);
            }
        } catch (error) {
            console.error('Error loading config:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveConfig = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'system', 'config'), config);
            alert('Configuration saved successfully!');
        } catch (error) {
            console.error('Error saving config:', error);
            alert('Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    if (user?.role !== 'owner') {
        return (
            <div className="flex items-center justify-center h-screen">
                <Card className="max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-600">
                            <Shield className="w-5 h-5" />
                            Access Denied
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">
                            You do not have permission to access this page. Only super admins can manage system configuration.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (loading) {
        return <div className="flex items-center justify-center h-screen">Loading...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Super Admin Settings</h1>
                <p className="text-muted-foreground">Manage global system configuration and pricing.</p>
            </div>

            {/* Subscription Pricing */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        Subscription Pricing (USD)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Base Price (USD/month)</label>
                            <Input
                                type="number"
                                step="0.01"
                                value={config.subscriptionPricing.baseUSD}
                                onChange={(e) => setConfig({
                                    ...config,
                                    subscriptionPricing: {
                                        ...config.subscriptionPricing,
                                        baseUSD: parseFloat(e.target.value) || 0
                                    }
                                })}
                            />
                            <p className="text-xs text-muted-foreground">Base monthly price in USD</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Pro Plan Multiplier</label>
                            <Input
                                type="number"
                                step="0.1"
                                value={config.subscriptionPricing.proPlanMultiplier}
                                onChange={(e) => setConfig({
                                    ...config,
                                    subscriptionPricing: {
                                        ...config.subscriptionPricing,
                                        proPlanMultiplier: parseFloat(e.target.value) || 1
                                    }
                                })}
                            />
                            <p className="text-xs text-muted-foreground">
                                Pro = ${(config.subscriptionPricing.baseUSD * config.subscriptionPricing.proPlanMultiplier).toFixed(2)}/mo
                            </p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Enterprise Multiplier</label>
                            <Input
                                type="number"
                                step="0.1"
                                value={config.subscriptionPricing.enterprisePlanMultiplier}
                                onChange={(e) => setConfig({
                                    ...config,
                                    subscriptionPricing: {
                                        ...config.subscriptionPricing,
                                        enterprisePlanMultiplier: parseFloat(e.target.value) || 1
                                    }
                                })}
                            />
                            <p className="text-xs text-muted-foreground">
                                Enterprise = ${(config.subscriptionPricing.baseUSD * config.subscriptionPricing.enterprisePlanMultiplier).toFixed(2)}/mo
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Feature Limits */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Feature Limits
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Free Trial Max Workers</label>
                            <Input
                                type="number"
                                value={config.features.maxWorkersFreeTrial}
                                onChange={(e) => setConfig({
                                    ...config,
                                    features: {
                                        ...config.features,
                                        maxWorkersFreeTrial: parseInt(e.target.value) || 0
                                    }
                                })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Pro Plan Max Workers</label>
                            <Input
                                type="number"
                                value={config.features.maxWorkersPro}
                                onChange={(e) => setConfig({
                                    ...config,
                                    features: {
                                        ...config.features,
                                        maxWorkersPro: parseInt(e.target.value) || 0
                                    }
                                })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Enterprise Max Workers</label>
                            <Input
                                type="number"
                                value={config.features.maxWorkersEnterprise}
                                onChange={(e) => setConfig({
                                    ...config,
                                    features: {
                                        ...config.features,
                                        maxWorkersEnterprise: parseInt(e.target.value) || 0
                                    }
                                })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={saveConfig} disabled={saving} size="lg">
                    {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
            </div>
        </div>
    );
}
