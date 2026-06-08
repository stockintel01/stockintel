import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function OfflinePage() {
    return (
        <main className="min-h-screen grid place-items-center p-6">
            <div className="max-w-md text-center space-y-4">
                <h1 className="text-3xl font-bold">You are offline</h1>
                <p className="text-muted-foreground">Previously loaded business data remains available offline. Supported changes sync automatically when your connection returns.</p>
                <Link href="/dashboard"><Button>Try again</Button></Link>
            </div>
        </main>
    );
}
