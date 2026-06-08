'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/auth/AuthContext';
import { useAppStore, IndustryType } from '@/lib/store';
import { Leaf, Pill, Store, Loader2, Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { createUserProfile, createOrganization } from '@/lib/firebase-utils';
import { isSuperAdminEmail } from '@/lib/access-control';

type AuthMode = 'signin' | 'signup' | 'reset';

const INPUT_CLASS = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function LoginInner() {
  const router       = useRouter();
  const params       = useSearchParams();
  const referralCode = params.get('ref');
  const { signInWithGoogle } = useAuth();

  // Form state
  const [mode, setMode]             = useState<AuthMode>('signin');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [name, setName]             = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [industry, setIndustry]     = useState<IndustryType>('pharmacy');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [resetSent, setResetSent]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // ── Human-readable Firebase error messages ────────────────
  function friendlyError(code: string, fallback?: string): string {
    const map: Record<string, string> = {
      'auth/user-not-found':        'No account found with this email. Check the address or sign up.',
      'auth/wrong-password':        'Incorrect password. Please try again or reset your password.',
      'auth/invalid-credential':    'Invalid email or password.',
      'auth/email-already-in-use':  'An account already exists with this email. Sign in instead.',
      'auth/weak-password':         'Password must be at least 6 characters.',
      'auth/invalid-email':         'Please enter a valid email address.',
      'auth/too-many-requests':     'Too many attempts. Please wait a moment and try again.',
      'auth/network-request-failed':'Network error. Check your connection and try again.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
      'auth/unauthorized-domain':   'This domain is not authorized in Firebase Authentication.',
      'auth/popup-closed-by-user':  'Sign-in popup was closed. Please try again.',
      'auth/cancelled-popup-request':'Another sign-in is in progress.',
      'auth/popup-blocked':         'Popup was blocked by your browser. Please allow popups and try again.',
    };
    return map[code] ?? fallback ?? 'Something went wrong. Please try again.';
  }

  // ── Sign In ───────────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true); setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(friendlyError(err.code, err.message));
    } finally { setLoading(false); }
  }

  // ── Sign Up ───────────────────────────────────────────────
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())     { setError('Please enter your full name.'); return; }
    if (!email)           { setError('Please enter your email.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true); setError('');
    try {
      // 1. Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });

      // 2. Create organisation in Firestore
      const orgId = await createOrganization(
        cred.user.uid,
        industry,
        'New Business',
        referralCode ?? undefined,
      );

      // 3. Create user profile document
      await createUserProfile({
        uid:            cred.user.uid,
        email:          cred.user.email ?? email,
        displayName:    name.trim(),
        photoURL:       cred.user.photoURL ?? '',
        organizationId: orgId,
        role:           isSuperAdminEmail(cred.user.email) ? 'super_admin' : 'owner',
        createdAt:      new Date(),
      } as any);

      // 4. Redirect to onboarding to fill business details
      router.push(isSuperAdminEmail(cred.user.email) ? '/dashboard' : '/onboarding');
    } catch (err: any) {
      setError(friendlyError(err.code, err.message));
    } finally { setLoading(false); }
  }

  // ── Password Reset ────────────────────────────────────────
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!email) { setError('Please enter the email address on your account.'); return; }
    setLoading(true); setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch (err: any) {
      setError(friendlyError(err.code, err.message));
    } finally { setLoading(false); }
  }

  // ── Google Sign In ────────────────────────────────────────
  async function handleGoogle() {
    setGoogleLoading(true); setError('');
    try {
      const { isNewUser } = await signInWithGoogle(referralCode ?? undefined);
      router.push(isNewUser ? '/onboarding' : '/dashboard');
    } catch (err: any) {
      setError(friendlyError(err.code, err.message));
    } finally { setGoogleLoading(false); }
  }

  const INDUSTRIES: { id: IndustryType; label: string; icon: React.ReactNode }[] = [
    { id: 'pharmacy',    label: 'Pharmacy',    icon: <Pill    className="w-5 h-5" /> },
    { id: 'agriculture', label: 'Agriculture', icon: <Leaf    className="w-5 h-5" /> },
    { id: 'retail',      label: 'Retail',      icon: <Store   className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-slate-900 via-blue-900 to-blue-800 p-12 text-white relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-700/20" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-blue-600/20" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white text-blue-700 flex items-center justify-center font-black text-base">SI</div>
          <span className="font-bold text-xl tracking-tight">StockIntel</span>
        </div>

        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <h1 className="text-4xl font-bold leading-tight">
              The intelligent operating system for modern businesses.
            </h1>
            <p className="text-blue-200 text-lg leading-relaxed">
              Real-time inventory, AI insights, patient records, farm management — all in one platform.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { emoji: '📦', label: 'Live Inventory' },
              { emoji: '🤖', label: 'AI Analytics'  },
              { emoji: '🌍', label: 'Global Ready'  },
            ].map(f => (
              <div key={f.label} className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
                <p className="text-xl mb-1">{f.emoji}</p>
                <p className="text-xs text-blue-100 font-medium">{f.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-sm text-blue-300">
          © {new Date().getFullYear()} StockIntel · All rights reserved
        </div>
      </div>

      {/* ── Right auth panel ── */}
      <div className="flex items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm">SI</div>
            <span className="font-bold text-lg">StockIntel</span>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border p-8 space-y-6">

            {/* ── Password Reset Sent ── */}
            {resetSent ? (
              <div className="text-center space-y-4 py-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold">Check your inbox</h2>
                <p className="text-muted-foreground text-sm">
                  We sent a password reset link to <strong>{email}</strong>. Check your spam folder if you don't see it.
                </p>
                <Button variant="outline" className="w-full" onClick={() => { setResetSent(false); setMode('signin'); }}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
                </Button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div>
                  <h2 className="text-2xl font-bold">
                    {mode === 'signin' ? 'Welcome back'
                      : mode === 'signup' ? 'Create your account'
                      : 'Reset your password'}
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {mode === 'signin' ? 'Sign in to your StockIntel workspace'
                      : mode === 'signup' ? 'Get started — it only takes a minute'
                      : 'Enter your email and we\'ll send a reset link'}
                  </p>
                </div>

                {/* Google OAuth */}
                {mode !== 'reset' && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 font-medium"
                    onClick={handleGoogle}
                    disabled={googleLoading || loading}
                  >
                    {googleLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    )}
                    Continue with Google
                  </Button>
                )}

                {/* Divider */}
                {mode !== 'reset' && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white dark:bg-zinc-900 px-2 text-muted-foreground">or continue with email</span>
                    </div>
                  </div>
                )}

                {/* ── Sign In Form ── */}
                {mode === 'signin' && (
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Email</label>
                      <Input className="mt-1" type="email" placeholder="you@company.com"
                        value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-sm font-medium">Password</label>
                        <button type="button" className="text-xs text-primary hover:underline"
                          onClick={() => { setMode('reset'); setError(''); }}>
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Input className="pr-10" type={showPass ? 'text' : 'password'}
                          placeholder="••••••••" value={password}
                          onChange={e => setPassword(e.target.value)} required />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowPass(s => !s)} tabIndex={-1}>
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                    <Button type="submit" className="w-full h-11" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Sign In
                    </Button>
                  </form>
                )}

                {/* ── Sign Up Form ── */}
                {mode === 'signup' && (
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Full Name</label>
                      <Input className="mt-1" placeholder="John Mensah" value={name}
                        onChange={e => setName(e.target.value)} required />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Email</label>
                      <Input className="mt-1" type="email" placeholder="you@company.com"
                        value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Password</label>
                      <div className="relative mt-1">
                        <Input className="pr-10" type={showPass ? 'text' : 'password'}
                          placeholder="Min 6 characters" value={password}
                          onChange={e => setPassword(e.target.value)} required minLength={6} />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowPass(s => !s)} tabIndex={-1}>
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">What best describes your business?</label>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        {INDUSTRIES.map(ind => (
                          <button key={ind.id} type="button"
                            onClick={() => setIndustry(ind.id)}
                            className={cn(
                              'flex flex-col items-center gap-1.5 p-2.5 rounded-lg border text-xs font-medium transition-all',
                              industry === ind.id
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-input hover:bg-muted'
                            )}>
                            {ind.icon}
                            {ind.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                    <Button type="submit" className="w-full h-11" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Create Account
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      By creating an account you agree to our{' '}
                      <a href="#" className="underline hover:text-foreground">Terms of Service</a>
                      {' '}and{' '}
                      <a href="#" className="underline hover:text-foreground">Privacy Policy</a>.
                    </p>
                  </form>
                )}

                {/* ── Password Reset Form ── */}
                {mode === 'reset' && (
                  <form onSubmit={handleReset} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Your account email</label>
                      <Input className="mt-1" type="email" placeholder="you@company.com"
                        value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                    <Button type="submit" className="w-full h-11" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Send Reset Link
                    </Button>
                    <Button type="button" variant="ghost" className="w-full" onClick={() => { setMode('signin'); setError(''); }}>
                      <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
                    </Button>
                  </form>
                )}

                {/* Mode switcher */}
                {mode !== 'reset' && (
                  <p className="text-center text-sm text-muted-foreground">
                    {mode === 'signin' ? (
                      <>Don&apos;t have an account?{' '}
                        <button className="text-primary font-medium hover:underline"
                          onClick={() => { setMode('signup'); setError(''); }}>Sign up free</button>
                      </>
                    ) : (
                      <>Already have an account?{' '}
                        <button className="text-primary font-medium hover:underline"
                          onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
                      </>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <LoginInner />
    </Suspense>
  );
}
