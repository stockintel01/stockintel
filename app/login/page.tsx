'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/auth/AuthContext';
import { ArrowLeft, Boxes, CheckCircle2, CloudSun, Eye, EyeOff, Leaf, Loader2, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '@/lib/firebase';
import { createUserProfile, createOrganization } from '@/lib/firebase-utils';
import { isSuperAdminEmail } from '@/lib/access-control';

type AuthMode = 'signin' | 'signup' | 'reset';

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
  const industry                    = 'agriculture' as const;
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [resetSent, setResetSent]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // ── Human-readable Firebase error messages ────────────────
  function friendlyError(error: unknown): string {
    const code = error instanceof FirebaseError ? error.code : '';
    const fallback = error instanceof Error ? error.message : undefined;
    const map: Record<string, string> = {
      'auth/user-not-found':        'No account found with this email. Check the address or sign up.',
      'auth/wrong-password':        'Incorrect password. Please try again or reset your password.',
      'auth/invalid-credential':    'Invalid email or password.',
      'auth/email-already-in-use':  'An account already exists with this email. Sign in instead.',
      'auth/weak-password':         'Password must be at least 8 characters.',
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
      router.replace('/dashboard');
    } catch (error) {
      setError(friendlyError(error));
    } finally { setLoading(false); }
  }

  // ── Sign Up ───────────────────────────────────────────────
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())     { setError('Please enter your full name.'); return; }
    if (!email)           { setError('Please enter your email.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
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
      });

      // 4. Redirect to onboarding to fill business details
      router.replace(isSuperAdminEmail(cred.user.email) ? '/dashboard' : '/onboarding');
    } catch (error) {
      setError(friendlyError(error));
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
    } catch (error) {
      setError(friendlyError(error));
    } finally { setLoading(false); }
  }

  // ── Google Sign In ────────────────────────────────────────
  async function handleGoogle() {
    setGoogleLoading(true); setError('');
    try {
      const { isNewUser } = await signInWithGoogle(referralCode ?? undefined);
      router.replace(isSuperAdminEmail(auth.currentUser?.email) ? '/dashboard' : isNewUser ? '/onboarding' : '/dashboard');
    } catch (error) {
      setError(friendlyError(error));
    } finally { setGoogleLoading(false); }
  }

  return (
    <div className="grid min-h-screen bg-stone-50 lg:grid-cols-[minmax(0,1.05fr)_minmax(480px,0.95fr)]">
      <div className="relative hidden overflow-hidden bg-[#123c2f] text-white lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)', backgroundSize: '52px 52px' }} />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#176b4a]"><Leaf className="h-5 w-5" /></div>
          <div><p className="text-lg font-semibold tracking-tight">StockIntel</p><p className="text-xs text-emerald-100/70">Agriculture operations</p></div>
        </div>

        <div className="relative max-w-xl space-y-7">
          <div className="space-y-4">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-200">One operational workspace</p>
            <h1 className="text-4xl font-semibold leading-[1.12] tracking-tight xl:text-[2.75rem]">Run every farm operation with clearer records and faster decisions.</h1>
            <p className="max-w-lg text-base leading-7 text-emerald-50/75">Manage inventory, field work, packhouse activity, expenses, weather planning, and team responsibilities from one secure workspace.</p>
          </div>
          <div className="grid gap-3">
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-4"><Boxes className="mt-0.5 h-5 w-5 text-emerald-200" /><div><p className="font-medium">Stock and material control</p><p className="mt-1 text-sm text-emerald-50/65">Know what is available, requested, issued, used, and returned.</p></div></div>
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-4"><CloudSun className="mt-0.5 h-5 w-5 text-emerald-200" /><div><p className="font-medium">Field intelligence</p><p className="mt-1 text-sm text-emerald-50/65">Connect observations, weather, plans, treatments, and reports.</p></div></div>
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-200" /><div><p className="font-medium">Controlled team access</p><p className="mt-1 text-sm text-emerald-50/65">Give each worker only the tools and records required for their role.</p></div></div>
          </div>
        </div>

        <p className="relative text-xs text-emerald-100/55">Copyright {new Date().getFullYear()} StockIntel. All rights reserved.</p>
      </div>

      <div className="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-12">
        <div className="w-full max-w-[440px]">

          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#176b4a] text-white"><Leaf className="h-5 w-5" /></div>
            <div><p className="font-semibold tracking-tight">StockIntel</p><p className="text-xs text-muted-foreground">Agriculture operations</p></div>
          </div>

          <div className="space-y-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">

            {/* ── Password Reset Sent ── */}
            {resetSent ? (
              <div className="text-center space-y-4 py-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold">Check your inbox</h2>
                <p className="text-muted-foreground text-sm">
                  We sent a password reset link to <strong>{email}</strong>. Check your spam folder if you don&apos;t see it.
                </p>
                <Button variant="outline" className="w-full" onClick={() => { setResetSent(false); setMode('signin'); }}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
                </Button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div>
                  <h2 className="text-2xl font-bold">
                    {mode === 'signin' ? 'Welcome back'
                      : mode === 'signup' ? 'Create your farm workspace'
                      : 'Reset your password'}
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {mode === 'signin' ? 'Sign in securely to continue your work.'
                      : mode === 'signup' ? 'Create the owner account for your agriculture organization.'
                      : 'Enter your account email and we will send a secure reset link.'}
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
                      <Input className="mt-1" type="email" inputMode="email" autoComplete="email" placeholder="you@company.com"
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
                        <Input className="pr-10" type={showPass ? 'text' : 'password'} autoComplete="current-password"
                          placeholder="Enter your password" value={password}
                          onChange={e => setPassword(e.target.value)} required />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setShowPass(s => !s)} aria-label={showPass ? 'Hide password' : 'Show password'}>
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                    <Button type="submit" className="h-11 w-full bg-[#176b4a] hover:bg-[#125a3e]" disabled={loading}>
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
                      <Input className="mt-1" autoComplete="name" placeholder="John Mensah" value={name}
                        onChange={e => setName(e.target.value)} required />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Email</label>
                      <Input className="mt-1" type="email" inputMode="email" autoComplete="email" placeholder="you@company.com"
                        value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Password</label>
                      <div className="relative mt-1">
                        <Input className="pr-10" type={showPass ? 'text' : 'password'} autoComplete="new-password"
                          placeholder="At least 8 characters" value={password}
                          onChange={e => setPassword(e.target.value)} required minLength={8} />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setShowPass(s => !s)} aria-label={showPass ? 'Hide password' : 'Show password'}>
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-100 bg-emerald-50/70 p-3 text-sm"><Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><p className="text-emerald-950">Your agriculture workspace will be ready for business details, farm locations, and team setup after registration.</p></div>
                    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                    <Button type="submit" className="h-11 w-full bg-[#176b4a] hover:bg-[#125a3e]" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Create Account
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">The account creator becomes the organization owner and can invite the rest of the team.</p>
                  </form>
                )}

                {/* ── Password Reset Form ── */}
                {mode === 'reset' && (
                  <form onSubmit={handleReset} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Your account email</label>
                      <Input className="mt-1" type="email" inputMode="email" autoComplete="email" placeholder="you@company.com"
                        value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                    <Button type="submit" className="h-11 w-full bg-[#176b4a] hover:bg-[#125a3e]" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Send Reset Link
                    </Button>
                    <Button type="button" variant="ghost" className="w-full" onClick={() => { setMode('signin'); setError(''); }}>
                      <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
                    </Button>
                  </form>
                )}

                {/* Mode switcher */}
                {mode !== 'reset' && (
                  <p className="text-center text-sm text-muted-foreground">
                    {mode === 'signin' ? (
                      <>Don&apos;t have an account?{' '}
                        <button type="button" className="font-medium text-[#176b4a] hover:underline"
                          onClick={() => { setMode('signup'); setError(''); }}>Create an account</button>
                      </>
                    ) : (
                      <>Already have an account?{' '}
                        <button type="button" className="font-medium text-[#176b4a] hover:underline"
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
