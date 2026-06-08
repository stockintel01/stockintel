'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { useAppStore } from '@/lib/store';
import { getInvitationById, acceptInvitation } from '@/lib/firebase-utils';
import {
    Loader2, CheckCircle2, AlertTriangle,
    Building2, Users, ArrowRight, ShieldCheck
} from 'lucide-react';

// ─── Inner component (needs useSearchParams → must be inside Suspense) ────────

function JoinInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const inviteId = searchParams.get('invite');
    const { signInWithGoogle } = useAuth();
    const { user, isAuthenticated, setStoreUser } = useAppStore();

    type Stage = 'loading' | 'preview' | 'signing-in' | 'accepting' | 'done' | 'error';
    const [stage, setStage] = useState<Stage>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [invite, setInvite] = useState<Record<string, string> | null>(null);

    // ── 1. Load invite details ────────────────────────────────────────────────
    useEffect(() => {
        if (!inviteId) {
            setErrorMsg('No invite ID found in URL. Please use the full link from your email.');
            setStage('error');
            return;
        }

        getInvitationById(inviteId)
            .then(data => {
                if (!data) { setErrorMsg('This invitation link is invalid or has expired.'); setStage('error'); return; }
                if ((data as Record<string, string>).status !== 'pending') {
                    setErrorMsg('This invitation has already been used or was cancelled.'); setStage('error'); return;
                }
                setInvite(data as Record<string, string>);
                setStage('preview');
            })
            .catch(() => { setErrorMsg('Could not load invitation. Check your connection.'); setStage('error'); });
    }, [inviteId]);

    // ── 2. If user is already signed in, skip straight to acceptance ──────────
    useEffect(() => {
        if (stage === 'preview' && isAuthenticated && user && invite && inviteId) {
            handleAccept();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage, isAuthenticated, user]);

    // ── 3. Sign in then accept ────────────────────────────────────────────────
    const handleSignInAndAccept = async () => {
        setStage('signing-in');
        try {
            await signInWithGoogle();
            // After Google resolves, user is in Zustand — handleAccept will be triggered via useEffect
        } catch {
            setErrorMsg('Google sign-in was cancelled or failed. Please try again.');
            setStage('preview');
        }
    };

    const handleAccept = async () => {
        if (!inviteId || !user) return;
        setStage('accepting');
        try {
            const result = await acceptInvitation(
                inviteId,
                user.id,
                user.name ?? '',
                user.email ?? '',
                '', // photoURL — Zustand user doesn't store it, Firebase Auth handles display
            );
            // Update Zustand store with org assignment
            setStoreUser(
                user ? { ...user, role: result.role as 'owner' | 'manager' | 'worker' } : null,
                { id: result.organizationId, name: invite?.orgName ?? 'Your Team', industry: 'pharmacy' as const, ownerId: '', referralCode: '', subscription: { plan: 'free_trial' as const, status: 'active' as const, trialEndsAt: new Date() } }
            );
            setStage('done');
            setTimeout(() => router.push('/dashboard'), 2000);
        } catch (err: unknown) {
            setErrorMsg(err instanceof Error ? err.message : 'Failed to accept invite.');
            setStage('error');
        }
    };

    // ─────────────────────────────────────────────────────────────────────────

    const roleColors: Record<string, string> = { owner: '#7c3aed', manager: '#2563eb', worker: '#16a34a' };
    const roleColor = invite ? (roleColors[invite.role] ?? '#6b7280') : '#6b7280';

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #f0f4ff 0%, #fafafa 60%, #f0fdf4 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

            <div style={{ width: '100%', maxWidth: 440, background: 'white', borderRadius: 20, boxShadow: '0 4px 40px rgba(0,0,0,0.10)', overflow: 'hidden' }}>

                {/* Top accent bar */}
                <div style={{ height: 5, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />

                <div style={{ padding: '40px 40px 36px' }}>

                    {/* ── Loading ──────────────────────────────── */}
                    {stage === 'loading' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <Loader2 size={36} style={{ color: '#6366f1', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                            <p style={{ color: '#6b7280', fontSize: 15 }}>Loading your invitation…</p>
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}

                    {/* ── Preview ──────────────────────────────── */}
                    {stage === 'preview' && invite && (
                        <>
                            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                                <div style={{ width: 64, height: 64, borderRadius: 16, background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                    <Users size={28} color="#6366f1" />
                                </div>
                                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
                                    You're invited!
                                </h1>
                                <p style={{ color: '#6b7280', fontSize: 15, lineHeight: 1.6 }}>
                                    You've been invited to join a workspace on <strong>StockIntel</strong>.
                                </p>
                            </div>

                            {/* Invite card */}
                            <div style={{ background: '#fafafa', border: '1.5px solid #e5e7eb', borderRadius: 14, padding: '20px 22px', marginBottom: 28 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Building2 size={18} color="#6366f1" />
                                        </div>
                                        <div>
                                            <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Organisation</p>
                                            <p style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{invite.orgName ?? 'Your new team'}</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 9, background: `${roleColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <ShieldCheck size={18} color={roleColor} />
                                        </div>
                                        <div>
                                            <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your role</p>
                                            <p style={{ fontSize: 15, fontWeight: 600, color: roleColor, textTransform: 'capitalize' }}>{invite.role}</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 9, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <span style={{ fontSize: 16 }}>✉️</span>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Invited email</p>
                                            <p style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>{invite.email}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleSignInAndAccept}
                                style={{ width: '100%', background: '#1e1e2e', color: 'white', border: 'none', borderRadius: 12, padding: '14px 24px', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s' }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#2d2d44')}
                                onMouseLeave={e => (e.currentTarget.style.background = '#1e1e2e')}
                            >
                                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: 18, height: 18, background: 'white', borderRadius: 3, padding: 2 }} />
                                Sign in with Google & Accept
                                <ArrowRight size={16} />
                            </button>

                            <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 16, lineHeight: 1.5 }}>
                                By accepting, you agree to StockIntel's Terms. Sign in with the same Google account as your invited email.
                            </p>
                        </>
                    )}

                    {/* ── Signing in ───────────────────────────── */}
                    {stage === 'signing-in' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <Loader2 size={36} style={{ color: '#6366f1', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                            <p style={{ fontWeight: 600, fontSize: 16, color: '#111827', marginBottom: 6 }}>Signing you in…</p>
                            <p style={{ color: '#9ca3af', fontSize: 14 }}>Complete the Google prompt to continue.</p>
                        </div>
                    )}

                    {/* ── Accepting ────────────────────────────── */}
                    {stage === 'accepting' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <Loader2 size={36} style={{ color: '#6366f1', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                            <p style={{ fontWeight: 600, fontSize: 16, color: '#111827', marginBottom: 6 }}>Joining workspace…</p>
                            <p style={{ color: '#9ca3af', fontSize: 14 }}>Setting up your account and permissions.</p>
                        </div>
                    )}

                    {/* ── Done ────────────────────────────────── */}
                    {stage === 'done' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                <CheckCircle2 size={32} color="white" />
                            </div>
                            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 10 }}>Welcome aboard! 🎉</h2>
                            <p style={{ color: '#6b7280', fontSize: 15, lineHeight: 1.6 }}>
                                You've joined the workspace. Redirecting to your dashboard…
                            </p>
                        </div>
                    )}

                    {/* ── Error ────────────────────────────────── */}
                    {stage === 'error' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                <AlertTriangle size={32} color="#dc2626" />
                            </div>
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 10 }}>Something went wrong</h2>
                            <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{errorMsg}</p>
                            <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f3f4f6', color: '#374151', padding: '10px 20px', borderRadius: 9, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
                                Go to homepage
                            </a>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

// ─── Page export (wraps inner in Suspense for useSearchParams) ────────────────

export default function JoinPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#6366f1' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        }>
            <JoinInner />
        </Suspense>
    );
}
