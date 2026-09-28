import Link from 'next/link';
import { ArrowLeft, Leaf } from 'lucide-react';

import { LegalLinks } from '@/components/legal/LegalLinks';
import { merchantDetails } from '@/lib/legal/merchant';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white"><Leaf className="h-5 w-5" /></span>
            <span><span className="block leading-none">StockIntel Agri</span><span className="mt-1 block text-[11px] font-medium text-slate-500">Trust and legal centre</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:flex"><ArrowLeft className="h-4 w-4" />Home</Link>
            <Link href="/login" className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800">Sign in</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-8 text-sm text-slate-600 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2">
            <p className="font-semibold text-slate-900">{merchantDetails.legalName}</p>
            <p>{merchantDetails.address} · <a className="text-emerald-800 hover:underline" href={`mailto:${merchantDetails.supportEmail}`}>{merchantDetails.supportEmail}</a>{merchantDetails.supportPhone ? ` · ${merchantDetails.supportPhone}` : ''}</p>
          </div>
          <LegalLinks className="flex flex-wrap gap-x-5 gap-y-2 sm:justify-end" />
        </div>
      </footer>
    </div>
  );
}
