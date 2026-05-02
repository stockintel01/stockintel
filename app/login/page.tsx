'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthContext';
import { useAppStore, IndustryType } from '@/lib/store';
import { Leaf, Pill, Store, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const referralCode = searchParams.get('ref');
    const login = useAppStore((state) => state.login);
    const { signInWithGoogle } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIndustry, setSelectedIndustry] = useState<IndustryType>('pharmacy');
    const [email, setEmail] = useState('demo@example.com');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        login(email, selectedIndustry);
        router.push('/dashboard');
    };

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        try {
            await signInWithGoogle(referralCode || undefined);
            router.push('/dashboard');
        } catch (error) {
            console.error("Google login failed", error);
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2">
            {/* Left: Branding */}
            <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-blue-600 to-blue-800 p-10 text-white">
                <div className="flex items-center gap-2 font-bold text-xl">
                    <div className="w-8 h-8 rounded-lg bg-white text-blue-600 flex items-center justify-center font-bold">SI</div>
                    StockIntel
                </div>
                <div className="space-y-4">
                    <h1 className="text-4xl font-bold leading-tight">
                        The Intelligent Operating System for your Business.
                    </h1>
                    <p className="text-blue-100 text-lg">
                        Manage inventory, sales, and purchasing with AI-driven insights tailored to your industry.
                    </p>
                </div>
                <div className="text-sm text-blue-200">
                    © 2024 StockIntel
                </div>
            </div>

            {/* Right: Login Form */}
            <div className="flex items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-950">
                <div className="w-full max-w-md space-y-8 bg-white dark:bg-black p-8 rounded-xl shadow-lg border">
                    <div className="text-center space-y-2">
                        <h2 className="text-2xl font-bold">Welcome back</h2>
                        <p className="text-muted-foreground">Sign in to your account</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Select Workspace Type</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['pharmacy', 'agriculture', 'retail'] as const).map((ind) => (
                                    <button
                                        key={ind}
                                        type="button"
                                        onClick={() => setSelectedIndustry(ind)}
                                        className={cn(
                                            "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all text-xs font-medium",
                                            selectedIndustry === ind
                                                ? "border-primary bg-primary/5 text-primary"
                                                : "border-input hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                        )}
                                    >
                                        {ind === 'pharmacy' && <Pill className="w-5 h-5" />}
                                        {ind === 'agriculture' && <Leaf className="w-5 h-5" />}
                                        {ind === 'retail' && <Store className="w-5 h-5" />}
                                        <span className="capitalize">{ind}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Email</label>
                            <input
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Password</label>
                            <input
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                type="password"
                                defaultValue="password"
                                required
                            />
                        </div>

                        <Button type="submit" className="w-full h-11" disabled={isLoading}>
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Sign In
                        </Button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">
                                    Or
                                </span>
                            </div>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            className="w-full h-11"
                            disabled={isLoading}
                            onClick={handleGoogleLogin}
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : (
                                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                                    <path
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        fill="#4285F4"
                                    />
                                    <path
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        fill="#34A853"
                                    />
                                    <path
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        fill="#FBBC05"
                                    />
                                    <path
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        fill="#EA4335"
                                    />
                                </svg>
                            )}
                            Sign in with Google
                        </Button>

                        <p className="text-center text-sm text-muted-foreground">
                            Don&apos;t have an account? <Link href="/" className="underline text-primary">Sign up</Link>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}
