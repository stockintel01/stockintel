'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { CreditCard, Calendar, AlertCircle, CheckCircle, Loader2, ShieldCheck } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import { isSuperAdminEmail } from '@/lib/access-control';
import Link from 'next/link';

interface BillingCatalog {
    provider: 'paystack' | 'stripe';
    currency: string;
    termsVersion: string;
    plans: Record<'pro' | 'enterprise', { amountMinor: number; configured: boolean }>;
}

export default function BillingPage() {
    const { user, organization } = useAppStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [catalog, setCatalog] = useState<BillingCatalog | null>(null);

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

    useEffect(() => {
        const payment = new URLSearchParams(window.location.search).get('payment');
        if (payment === 'success') setNotice('Payment confirmed. Your subscription is active.');
        if (payment === 'verification-failed') setError('We could not verify that payment yet. Your access has not been changed. Contact support with the Paystack reference if you were charged.');
        if (new URLSearchParams(window.location.search).get('canceled') === 'true') setNotice('Checkout was cancelled. No subscription change was made.');
        let active = true;
        void authenticatedFetch('/api/billing/plans').then(async response => {
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Unable to load subscription prices');
            if (active) setCatalog(payload as BillingCatalog);
        }).catch(reason => {
            if (active) setError(reason instanceof Error ? reason.message : 'Unable to load subscription prices');
        });
        return () => { active = false; };
    }, []);

    const price = (plan: 'pro' | 'enterprise') => {
        const item = catalog?.plans[plan];
        if (!item) return 'Loading price…';
        return new Intl.NumberFormat('en-GH', { style: 'currency', currency: catalog.currency }).format(item.amountMinor / 100);
    };

    const handleUpgrade = async (plan: 'pro' | 'enterprise') => {
        if (!organization?.id || !user?.id) {
            setError('Missing organization or user information');
            return;
        }
        if (!catalog || !catalog.plans[plan].configured) {
            setError('This payment plan is not configured yet.');
            return;
        }
        if (!acceptedTerms) {
            setError('Accept the subscription, privacy, and refund terms before continuing.');
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
                    acceptedTerms: true,
                    termsVersion: catalog.termsVersion,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create checkout session');
            }

            if (!data.url) throw new Error('The secure checkout URL was not returned');
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

            {notice && (
                <Card className="border-emerald-200 bg-emerald-50"><CardContent className="pt-6"><div className="flex items-center gap-2 text-emerald-800"><CheckCircle className="h-5 w-5" /><span>{notice}</span></div></CardContent></Card>
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
                <div className="space-y-5">
                <div className="rounded-xl border bg-card p-4 text-sm">
                    <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4" checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} /><span>I authorize the displayed monthly recurring charge until cancellation and agree to the <Link className="font-medium text-primary underline" href="/legal/terms" target="_blank">Terms</Link>, <Link className="font-medium text-primary underline" href="/legal/privacy" target="_blank">Privacy Policy</Link>, and <Link className="font-medium text-primary underline" href="/legal/refunds" target="_blank">Refund and Cancellation Policy</Link>.</span></label>
                    <p className="mt-3 text-xs text-muted-foreground">Payment is completed on {catalog?.provider === 'paystack' ? 'Paystack’s' : 'the payment provider’s'} secure hosted checkout. StockIntel does not store your full card number, PIN, or CVV. Paid access starts only after server verification.</p>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Pro Plan */}
                    <Card className="border-2 border-blue-200">
                        <CardHeader>
                            <CardTitle>Pro Plan</CardTitle>
                            <div className="text-3xl font-bold">{price('pro')}<span className="text-lg text-muted-foreground">/month</span></div>
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
                                disabled={loading || !catalog?.plans.pro.configured}
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
                            <div className="text-3xl font-bold">{price('enterprise')}<span className="text-lg text-muted-foreground">/month</span></div>
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
                                disabled={loading || !catalog?.plans.enterprise.configured}
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upgrade to Enterprise'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
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
                        <p className="pt-2 text-xs text-muted-foreground">Cancellation stops future renewal. Refund eligibility and digital delivery terms are available in our <Link className="underline" href="/legal/refunds">Refund and Cancellation Policy</Link>.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
