'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardHome() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/dashboard/agriculture');
    }, [router]);

    return (
        <div className="min-h-[50vh] flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
    );
}
