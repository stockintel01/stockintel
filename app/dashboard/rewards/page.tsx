'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { activateCredit } from '@/lib/firebase-utils';
import { collection, query, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Gift, Copy, Check, Calendar, TrendingUp } from 'lucide-react';

interface Credit {
    id: string;
    amountMonths: number;
    reason: 'signup_referral' | 'upgrade_referral';
    status: 'pending' | 'available' | 'used';
    fromOrgId: string;
    createdAt: any;
}

export default function RewardsPage() {
    const { organization } = useAppStore();
    const [credits, setCredits] = useState<Credit[]>([]);
    const [copied, setCopied] = useState(false);
    const [activating, setActivating] = useState<string | null>(null);
    const [activateMsg, setActivateMsg] = useState('');

    // Listen to credits
    useEffect(() => {
        if (!organization?.id) return;

        const creditsQuery = query(
            collection(db, `organizations/${organization.id}/credits`)
        );

        const unsubscribe = onSnapshot(creditsQuery, (snapshot) => {
            const creditsList: Credit[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Credit));
            setCredits(creditsList);
        });

        return () => unsubscribe();
    }, [organization?.id]);

    const [origin, setOrigin] = useState('');
    useEffect(() => { setOrigin(window.location.origin); }, []);
    const referralLink = organization?.referralCode && origin
        ? `${origin}/login?ref=${organization.referralCode}`
        : '';

    const handleCopy = () => {
        navigator.clipboard.writeText(referralLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleActivate = async (creditId: string, months: number) => {
        if (!organization?.id) return;

        setActivating(creditId);
        try {
            await activateCredit(organization.id, creditId, months);
            setActivateMsg(`${months} month(s) of free credit activated!`);
            setTimeout(() => setActivateMsg(''), 4000);
        } catch (error) {
            console.error('Error activating credit:', error);
            setActivateMsg('Failed to activate credit — please try again.');
        } finally {
            setActivating(null);
        }
    };

    const availableCredits = credits.filter(c => c.status === 'available');
    const usedCredits = credits.filter(c => c.status === 'used');
    const totalAvailableMonths = availableCredits.reduce((sum, c) => sum + c.amountMonths, 0);

    const trialEndDate = organization?.subscription?.trialEndsAt
        ? (organization.subscription.trialEndsAt instanceof Date
            ? organization.subscription.trialEndsAt
            : new Date(organization.subscription.trialEndsAt))
        : null;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Rewards & Referrals</h1>
                <p className="text-muted-foreground">Invite companies and earn free months!</p>
            {activateMsg && (
                <p className={`text-sm px-4 py-2 rounded-lg border ${activateMsg.includes('Failed') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                    {activateMsg}
                </p>
            )}
            </div>

            {/* Subscription Status */}
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        Current Subscription
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Plan</span>
                            <span className="font-bold capitalize">{organization?.subscription?.plan?.replace('_', ' ')}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Status</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${organization?.subscription?.status === 'active'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                {organization?.subscription?.status}
                            </span>
                        </div>
                        {trialEndDate && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Trial Ends</span>
                                <span className="font-medium">{trialEndDate.toLocaleDateString()}</span>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Referral Link */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Gift className="w-5 h-5" />
                        Your Referral Link
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        Share this link with other companies. You'll earn:
                    </p>
                    <ul className="text-sm space-y-2 mb-4 ml-4">
                        <li className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-green-600" />
                            <span><strong>1 Month Free</strong> when they sign up</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-green-600" />
                            <span><strong>1 Extra Month Free</strong> when they upgrade to paid</span>
                        </li>
                    </ul>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            readOnly
                            value={referralLink}
                            className="flex-1 h-10 rounded-md border border-input bg-muted px-3 py-2 text-sm"
                        />
                        <Button onClick={handleCopy} variant="outline">
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Referral Code: <span className="font-mono font-bold">{organization?.referralCode}</span>
                    </p>
                </CardContent>
            </Card>

            {/* Available Credits */}
            <Card>
                <CardHeader>
                    <CardTitle>Available Credits ({totalAvailableMonths} months)</CardTitle>
                </CardHeader>
                <CardContent>
                    {availableCredits.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No credits available yet. Start referring companies!
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {availableCredits.map((credit) => (
                                <div key={credit.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                    <div>
                                        <div className="font-medium">{credit.amountMonths} Month{credit.amountMonths > 1 ? 's' : ''} Free</div>
                                        <div className="text-xs text-muted-foreground">
                                            {credit.reason === 'signup_referral' ? 'Sign-up Referral' : 'Upgrade Referral'}
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => handleActivate(credit.id, credit.amountMonths)}
                                        disabled={activating === credit.id}
                                    >
                                        {activating === credit.id ? 'Activating...' : 'Activate'}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Used Credits */}
            {usedCredits.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Credit History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {usedCredits.map((credit) => (
                                <div key={credit.id} className="flex items-center justify-between p-3 border rounded-lg opacity-60">
                                    <div>
                                        <div className="font-medium">{credit.amountMonths} Month{credit.amountMonths > 1 ? 's' : ''}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {credit.reason === 'signup_referral' ? 'Sign-up Referral' : 'Upgrade Referral'}
                                        </div>
                                    </div>
                                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">Used</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
