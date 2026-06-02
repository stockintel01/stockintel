'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore, IndustryType } from '@/lib/store';
import { useAuth } from '@/components/auth/AuthContext';
import { createOrganization } from '@/lib/firebase-utils';
import { inviteMember } from '@/lib/firebase-utils';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    Pill, Leaf, Store, Building2, Globe, Receipt,
    Users, CheckCircle, ArrowRight, ArrowLeft,
    Loader2, Plus, X, Sparkles, MapPin, Phone, Mail
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BusinessSetup {
    businessName: string;
    industry: IndustryType;
    address: string;
    phone: string;
    email: string;
    taxId: string;
    currency: string;
    country: string;
}

interface InviteEntry { email: string; role: 'manager' | 'worker' }

// ─── Step config ─────────────────────────────────────────────────────────────

const STEPS = [
    { id: 'welcome',   label: 'Welcome'    },
    { id: 'industry',  label: 'Industry'   },
    { id: 'business',  label: 'Business'   },
    { id: 'team',      label: 'Team'       },
    { id: 'complete',  label: 'Done'       },
];

const INDUSTRIES: { id: IndustryType; label: string; desc: string; icon: React.ElementType; color: string; bg: string }[] = [
    { id: 'pharmacy',    label: 'Pharmacy',    desc: 'Drugs, prescriptions & patient records', icon: Pill,  color: '#2563eb', bg: '#dbeafe' },
    { id: 'agriculture', label: 'Agriculture', desc: 'Seeds, fertilizers & equipment',         icon: Leaf,  color: '#16a34a', bg: '#dcfce7' },
    { id: 'retail',      label: 'Retail',      desc: 'General merchandise & POS billing',      icon: Store, color: '#7c3aed', bg: '#ede9fe' },
];

const CURRENCIES = [
    { symbol: 'GHS', label: 'GHS — Ghanaian Cedi' },
    { symbol: '₦', label: 'NGN — Nigerian Naira' },
    { symbol: 'KSh', label: 'KES — Kenyan Shilling' },
    { symbol: 'UGX', label: 'UGX — Ugandan Shilling' },
    { symbol: 'TZS', label: 'TZS — Tanzanian Shilling' },
    { symbol: 'ZAR', label: 'ZAR — South African Rand' },
    { symbol: '$', label: 'USD — US Dollar' },
    { symbol: '£', label: 'GBP — British Pound' },
    { symbol: '€', label: 'EUR — Euro' },
    { symbol: '₹', label: 'INR — Indian Rupee' },
    { symbol: '₵', label: 'GHS — Ghana Cedi (₵)' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
    const router = useRouter();
    const { user, organization, setIndustry, setCurrency, updateReceiptSettings } = useAppStore();
    const { signInWithGoogle } = useAuth();

    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [business, setBusiness] = useState<BusinessSetup>({
        businessName: organization?.name ?? '',
        industry: (organization?.industry ?? 'pharmacy') as IndustryType,
        address: '',
        phone: '',
        email: user?.email ?? '',
        taxId: '',
        currency: 'GHS',
        country: 'Ghana',
    });

    const [invites, setInvites] = useState<InviteEntry[]>([{ email: '', role: 'manager' }]);

    // Skip onboarding if already completed
    useEffect(() => {
        if (organization?.id && step === 0) {
            // Show welcome anyway for new users
        }
    }, [organization, step]);

    const activeIndustry = INDUSTRIES.find(i => i.id === business.industry) ?? INDUSTRIES[0];

    // ── Handlers ─────────────────────────────────────────────────────────────

    const updateBusiness = (fields: Partial<BusinessSetup>) =>
        setBusiness(prev => ({ ...prev, ...fields }));

    const addInvite = () =>
        setInvites(prev => [...prev, { email: '', role: 'manager' }]);

    const removeInvite = (i: number) =>
        setInvites(prev => prev.filter((_, idx) => idx !== i));

    const updateInvite = (i: number, fields: Partial<InviteEntry>) =>
        setInvites(prev => prev.map((inv, idx) => idx === i ? { ...inv, ...fields } : inv));

    const canProceed = () => {
        if (step === 1) return !!business.industry;
        if (step === 2) return business.businessName.trim().length >= 2;
        return true;
    };

    const handleNext = async () => {
        setError('');

        // On business step — save to Firestore
        if (step === 2) {
            setSaving(true);
            try {
                // Update Zustand store immediately for responsive UI
                setIndustry(business.industry);
                setCurrency(business.currency);
                updateReceiptSettings({
                    businessName: business.businessName,
                    address: business.address,
                    phone: business.phone,
                    email: business.email,
                    taxId: business.taxId,
                });

                // Persist to Firestore org document if user is logged in
                if (organization?.id) {
                    await updateDoc(doc(db, 'organizations', organization.id), {
                        name: business.businessName,
                        industry: business.industry,
                        currency: business.currency,
                        address: business.address,
                        phone: business.phone,
                        taxId: business.taxId,
                        onboardingStep: 'business_complete',
                    });
                }
            } catch (err) {
                console.error('Failed to save business details:', err);
                setError('Failed to save. Please check your connection and try again.');
                setSaving(false);
                return;
            }
            setSaving(false);
        }

        // On team step — send invites
        if (step === 3) {
            setSaving(true);
            const validInvites = invites.filter(i => i.email.trim() && i.email.includes('@'));
            if (validInvites.length > 0 && organization?.id) {
                try {
                    await Promise.all(
                        validInvites.map(inv => inviteMember(inv.email.trim(), inv.role, organization.id))
                    );
                } catch (err) {
                    console.error('Some invites failed:', err);
                    // Non-fatal — continue to completion
                }
            }
            setSaving(false);

            // Mark onboarding complete in Firestore
            if (organization?.id) {
                await updateDoc(doc(db, 'organizations', organization.id), {
                    onboardingComplete: true,
                }).catch(console.error);
            }
        }

        if (step < STEPS.length - 1) {
            setStep(s => s + 1);
        } else {
            // Mark authenticated before navigating — prevents dashboard guard redirect
            setAuthenticated(true);
            router.push('/dashboard');
        }
    };

    const handleBack = () => {
        if (step > 0) setStep(s => s - 1);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #f0f4ff 0%, #fafafa 50%, #f0fdf4 100%)',
            fontFamily: "'DM Sans', system-ui, sans-serif",
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
        }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
                * { box-sizing: border-box; }
                .step-btn { background: none; border: none; cursor: pointer; transition: all 0.2s; }
                .step-btn:disabled { opacity: 0.4; cursor: not-allowed; }
                .ind-card { border: 2px solid #e5e7eb; border-radius: 14px; padding: 20px; cursor: pointer; transition: all 0.2s; background: white; display: flex; align-items: flex-start; gap: 14px; }
                .ind-card:hover { border-color: #d1d5db; box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform: translateY(-1px); }
                .ind-card.active { border-color: var(--ind-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ind-color) 15%, transparent); }
                .field { display: flex; flex-direction: column; gap: 6px; }
                .label { font-size: 13px; font-weight: 500; color: #374151; }
                .input { height: 40px; border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 0 12px; font-size: 14px; font-family: inherit; background: white; transition: border-color 0.15s; outline: none; width: 100%; }
                .input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
                .select { height: 40px; border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 0 12px; font-size: 14px; font-family: inherit; background: white; outline: none; width: 100%; cursor: pointer; }
                .select:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
                .btn-primary { background: #1e1e2e; color: white; border: none; border-radius: 10px; padding: 12px 28px; font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
                .btn-primary:hover:not(:disabled) { background: #2d2d44; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(30,30,46,0.3); }
                .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
                .btn-ghost { background: transparent; color: #6b7280; border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 500; font-family: inherit; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.15s; }
                .btn-ghost:hover { background: #f3f4f6; color: #374151; }
                .invite-row { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; }
                .role-badge { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 6px; cursor: pointer; border: 1.5px solid #e5e7eb; background: white; transition: all 0.15s; }
                .role-badge.active-manager { border-color: #6366f1; background: #eef2ff; color: #4338ca; }
                .role-badge.active-worker  { border-color: #16a34a; background: #f0fdf4; color: #15803d; }
                .fade-up { animation: fadeUp 0.4s ease forwards; }
                @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
                .check-ring { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; animation: popIn 0.5s cubic-bezier(.17,.67,.35,1.3) forwards; }
                @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            `}</style>

            {/* Card */}
            <div style={{ width: '100%', maxWidth: 560, background: 'white', borderRadius: 20, boxShadow: '0 4px 40px rgba(0,0,0,0.10)', overflow: 'hidden' }}>

                {/* Progress bar */}
                <div style={{ height: 4, background: '#f3f4f6', position: 'relative' }}>
                    <div style={{
                        position: 'absolute', top: 0, left: 0, height: '100%',
                        width: `${((step) / (STEPS.length - 1)) * 100}%`,
                        background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                        transition: 'width 0.5s cubic-bezier(.4,0,.2,1)',
                        borderRadius: '0 4px 4px 0',
                    }} />
                </div>

                {/* Step pills */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '16px 24px 0' }}>
                    {STEPS.map((s, i) => (
                        <div key={s.id} style={{
                            fontSize: 11, fontWeight: 600, padding: '4px 12px',
                            borderRadius: 999, letterSpacing: '0.04em',
                            background: i === step ? '#1e1e2e' : i < step ? '#f0fdf4' : '#f3f4f6',
                            color: i === step ? 'white' : i < step ? '#15803d' : '#9ca3af',
                            transition: 'all 0.3s',
                        }}>
                            {i < step ? '✓ ' : ''}{s.label}
                        </div>
                    ))}
                </div>

                {/* Body */}
                <div className="fade-up" key={step} style={{ padding: '32px 40px 40px' }}>

                    {/* ── Step 0: Welcome ─────────────────────────── */}
                    {step === 0 && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ width: 64, height: 64, borderRadius: 16, background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                <Sparkles size={28} color="#6366f1" />
                            </div>
                            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', marginBottom: 10 }}>
                                Welcome to IntelliStock AI
                            </h1>
                            <p style={{ color: '#6b7280', fontSize: 15, lineHeight: 1.6, marginBottom: 32, maxWidth: 380, margin: '0 auto 32px' }}>
                                Let's set up your workspace in under 2 minutes. We'll collect just the essentials to get you started.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', background: '#fafafa', borderRadius: 12, padding: '20px 24px', marginBottom: 8 }}>
                                {[
                                    ['🏭', 'Choose your industry', 'Pharmacy, Agriculture, or Retail'],
                                    ['🏢', 'Set up your business', 'Name, address, currency & tax ID'],
                                    ['👥', 'Invite your team', 'Get colleagues onboard right away'],
                                ].map(([emoji, title, desc]) => (
                                    <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                        <span style={{ fontSize: 20 }}>{emoji}</span>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{title}</div>
                                            <div style={{ fontSize: 13, color: '#9ca3af' }}>{desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Step 1: Industry ────────────────────────── */}
                    {step === 1 && (
                        <div>
                            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 6 }}>What's your industry?</h2>
                            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
                                This configures your dashboard, reports, and terminology.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {INDUSTRIES.map(ind => (
                                    <div
                                        key={ind.id}
                                        className={`ind-card${business.industry === ind.id ? ' active' : ''}`}
                                        style={{ '--ind-color': ind.color } as React.CSSProperties}
                                        onClick={() => updateBusiness({ industry: ind.id })}
                                    >
                                        <div style={{ width: 44, height: 44, borderRadius: 10, background: ind.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <ind.icon size={22} color={ind.color} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>{ind.label}</div>
                                            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{ind.desc}</div>
                                        </div>
                                        {business.industry === ind.id && (
                                            <CheckCircle size={20} color={ind.color} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Step 2: Business setup ───────────────────── */}
                    {step === 2 && (
                        <div>
                            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Set up your business</h2>
                            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
                                This appears on receipts and reports. You can update it later in Settings.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div className="field">
                                    <label className="label"><Building2 size={13} style={{ display: 'inline', marginRight: 4 }} />Business Name *</label>
                                    <input className="input" placeholder="e.g. City Pharmacy, Green Agro Supplies" value={business.businessName}
                                        onChange={e => updateBusiness({ businessName: e.target.value })} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div className="field">
                                        <label className="label"><Globe size={13} style={{ display: 'inline', marginRight: 4 }} />Currency</label>
                                        <select className="select" value={business.currency} onChange={e => updateBusiness({ currency: e.target.value })}>
                                            {CURRENCIES.map(c => <option key={c.symbol} value={c.symbol}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="field">
                                        <label className="label"><MapPin size={13} style={{ display: 'inline', marginRight: 4 }} />Country</label>
                                        <input className="input" placeholder="India" value={business.country}
                                            onChange={e => updateBusiness({ country: e.target.value })} />
                                    </div>
                                </div>

                                <div className="field">
                                    <label className="label"><MapPin size={13} style={{ display: 'inline', marginRight: 4 }} />Address</label>
                                    <input className="input" placeholder="Street, City, State, PIN" value={business.address}
                                        onChange={e => updateBusiness({ address: e.target.value })} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div className="field">
                                        <label className="label"><Phone size={13} style={{ display: 'inline', marginRight: 4 }} />Phone</label>
                                        <input className="input" type="tel" placeholder="+91 98765 43210" value={business.phone}
                                            onChange={e => updateBusiness({ phone: e.target.value })} />
                                    </div>
                                    <div className="field">
                                        <label className="label"><Mail size={13} style={{ display: 'inline', marginRight: 4 }} />Business Email</label>
                                        <input className="input" type="email" placeholder="hello@yourbusiness.com" value={business.email}
                                            onChange={e => updateBusiness({ email: e.target.value })} />
                                    </div>
                                </div>

                                <div className="field">
                                    <label className="label"><Receipt size={13} style={{ display: 'inline', marginRight: 4 }} />GST / Tax ID <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
                                    <input className="input" placeholder="29AAAAA0000A1Z5" value={business.taxId}
                                        onChange={e => updateBusiness({ taxId: e.target.value })} />
                                </div>

                                {error && (
                                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>
                                        {error}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: Team invites ─────────────────────── */}
                    {step === 3 && (
                        <div>
                            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Invite your team</h2>
                            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
                                They'll receive an email to join <strong>{business.businessName || 'your workspace'}</strong>. Skip if you prefer to do this later.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {invites.map((inv, i) => (
                                    <div key={i} className="invite-row">
                                        <input
                                            className="input"
                                            type="email"
                                            placeholder={`colleague${i + 1}@company.com`}
                                            value={inv.email}
                                            onChange={e => updateInvite(i, { email: e.target.value })}
                                        />
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {(['manager', 'worker'] as const).map(r => (
                                                <button
                                                    key={r}
                                                    className={`role-badge${inv.role === r ? ` active-${r}` : ''}`}
                                                    onClick={() => updateInvite(i, { role: r })}
                                                    type="button"
                                                >
                                                    {r}
                                                </button>
                                            ))}
                                        </div>
                                        {invites.length > 1 && (
                                            <button onClick={() => removeInvite(i)} type="button"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))}

                                <button onClick={addInvite} type="button"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6366f1', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}>
                                    <Plus size={15} /> Add another
                                </button>
                            </div>

                            <div style={{ marginTop: 20, padding: '14px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 13, color: '#15803d' }}>
                                <strong>Roles explained:</strong> Managers can add/edit inventory & view reports. Workers can process sales and adjust stock quantities only.
                            </div>
                        </div>
                    )}

                    {/* ── Step 4: Complete ─────────────────────────── */}
                    {step === 4 && (
                        <div style={{ textAlign: 'center' }}>
                            <div className="check-ring">
                                <CheckCircle size={36} color="white" />
                            </div>
                            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 10 }}>
                                You're all set, {user?.name?.split(' ')[0] ?? 'there'}!
                            </h2>
                            <p style={{ color: '#6b7280', fontSize: 15, marginBottom: 32, lineHeight: 1.65 }}>
                                <strong>{business.businessName || 'Your workspace'}</strong> is ready to go. Your inventory has been seeded with starter data to help you explore.
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 32 }}>
                                {[
                                    { emoji: '📦', title: 'Inventory', desc: 'Auto-seeded & ready' },
                                    { emoji: '🔒', title: 'Secure', desc: 'Role-based access' },
                                    { emoji: '📊', title: 'Live Data', desc: 'Real-time Firestore' },
                                ].map(card => (
                                    <div key={card.title} style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 12px' }}>
                                        <div style={{ fontSize: 22, marginBottom: 6 }}>{card.emoji}</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{card.title}</div>
                                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{card.desc}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Industry summary */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: activeIndustry.bg, borderRadius: 10, marginBottom: 8 }}>
                                <activeIndustry.icon size={20} color={activeIndustry.color} />
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: activeIndustry.color }}>
                                        {activeIndustry.label} workspace configured
                                    </div>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                                        Currency: {business.currency} · Country: {business.country}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Navigation ───────────────────────────────── */}
                    <div style={{ display: 'flex', justifyContent: step === 0 ? 'flex-end' : 'space-between', alignItems: 'center', marginTop: 36, paddingTop: 24, borderTop: '1px solid #f3f4f6' }}>
                        {step > 0 && (
                            <button className="btn-ghost" onClick={handleBack} disabled={saving}>
                                <ArrowLeft size={16} /> Back
                            </button>
                        )}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            {(step === 3) && (
                                <button className="btn-ghost" onClick={() => {
                                    setInvites([{ email: '', role: 'manager' }]);
                                    setStep(4);
                                }}>
                                    Skip
                                </button>
                            )}
                            <button
                                className="btn-primary"
                                onClick={handleNext}
                                disabled={saving || !canProceed()}
                            >
                                {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                                {step === STEPS.length - 1 ? 'Go to Dashboard' : 'Continue'}
                                {!saving && <ArrowRight size={16} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Step counter */}
            <p style={{ marginTop: 20, fontSize: 13, color: '#9ca3af' }}>
                Step {step + 1} of {STEPS.length}
            </p>
        </div>
    );
}
