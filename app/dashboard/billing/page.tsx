'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { CreditCard, Calendar, AlertCircle, CheckCircle, Loader2, ShieldCheck } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import { isSuperAdminEmail } from '@/lib/access-control';

export default function BillingPage() {
    const { user, organization } = useAppStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const subscription = organization?.subscription;
    const isSuperAdmin = isSuperAdminEmail(user?.email);
    const isFreeTrial = subscription?.plan === 'free_trial';
    const isActive = subscription?.status === 'active';

    const trialEndDate = subscription?.trialEndsAt
        ? (subscription.trialEndsAt instanceof Date
            ? subscription.trialEndsAt
            : new Date(subscription.trialEndsAt))
        : null;

    const daysRemaining = trialEndDate
        ? Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0;

    const handleUpgrade = async (plan: 'pro' | 'enterprise') => {
        if (!organization?.id || !user?.id) {
            setError('Missing organization or user information');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await authenticatedFetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plan,
                    organizationId: organization.id,
                    userId: user.id,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create checkout session');
            }

            if (!data.url) throw new Error('Stripe checkout URL was not returned');
            window.location.href = data.url;
        } catch (err: unknown) {
            console.error('Upgrade error:', err);
            setError(err instanceof Error ? err.message : 'Failed to start checkout');
        } finally {
            setLoading(false);
        }
    };

    const handlePortal = async () => {
        if (!organization?.id) return;
        setLoading(true);
        setError(null);
        try {
            const response = await authenticatedFetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organizationId: organization.id, action: 'portal' }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to open billing portal');
            window.location.href = data.url;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to open billing portal');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Billing & Subscription</h1>
                <p className="text-muted-foreground">Manage your subscription and payment methods.</p>
            </div>

            {error && (
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="w-5 h-5" />
                            <span>{error}</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {isSuperAdmin && (
                <Card className="border-emerald-300 bg-emerald-50">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3 text-emerald-800">
                            <ShieldCheck className="w-5 h-5 mt-0.5" />
                            <div>
                                <div className="font-semibold">Complimentary Super Admin Access</div>
                                <p className="text-sm mt-1">Your account has unrestricted access to every feature and does not require a paid subscription.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Current Subscription */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5" />
                        Current Plan
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-2xl font-bold capitalize">
                                {subscription?.plan?.replace('_', ' ')}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {isFreeTrial ? 'Free Trial Period' : 'Active Subscription'}
                            </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                            {subscription?.status}
                        </div>
                    </div>

                    {isFreeTrial && trialEndDate && (
                        <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <Calendar className="w-5 h-5 text-blue-600" />
                            <div>
                                <div className="font-medium text-blue-900">
                                    {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Trial expired'}
                                </div>
                                <div className="text-sm text-blue-700">
                                    Trial ends on {trialEndDate.toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pricing Plans */}
            {isFreeTrial && !isSuperAdmin && (
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Pro Plan */}
                    <Card className="border-2 border-blue-200">
                        <CardHeader>
                            <CardTitle>Pro Plan</CardTitle>
                            <div className="text-3xl font-bold">$9<span className="text-lg text-muted-foreground">/month</span></div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ul className="space-y-2">
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span>Up to 25 team members</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span>Advanced analytics</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span>Priority support</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span>Export to CSV/PDF</span>
                                </li>
                            </ul>
                            <Button
                                className="w-full"
                                onClick={() => handleUpgrade('pro')}
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upgrade to Pro'}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Enterprise Plan */}
                    <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                Enterprise
                                <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full">Popular</span>
                            </CardTitle>
                            <div className="text-3xl font-bold">$27<span className="text-lg text-muted-foreground">/month</span></div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ul className="space-y-2">
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span>Unlimited team members</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span>All Pro features</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span>Custom integrations</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span>Dedicated account manager</span>
                                </li>
                            </ul>
                            <Button
                                className="w-full bg-purple-600 hover:bg-purple-700"
                                onClick={() => handleUpgrade('enterprise')}
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upgrade to Enterprise'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Active Subscription Info */}
            {!isFreeTrial && (
                <Card>
                    <CardHeader>
                        <CardTitle>Subscription Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Plan</span>
                            <span className="font-medium capitalize">{subscription?.plan}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Status</span>
                            <span className="font-medium">{subscription?.status}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Billing Cycle</span>
                            <span className="font-medium">Monthly</span>
                        </div>
                        {!isSuperAdmin && <Button className="mt-4" variant="outline" disabled={loading} onClick={handlePortal}>Manage Payment Method or Cancel</Button>}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
