import Link from 'next/link';
import { Leaf } from 'lucide-react';

import { LegalLinks } from '@/components/legal/LegalLinks';
import { merchantDetails } from '@/lib/legal/merchant';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold"><Leaf className="h-5 w-5 text-emerald-700" /> StockIntel Agri</Link>
          <Link href="/login" className="text-sm font-medium text-emerald-700 hover:underline">Sign in</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-10">{children}</main>
      <footer className="border-t bg-white">
        <div className="mx-auto max-w-4xl space-y-3 px-5 py-6 text-sm text-slate-600">
          <LegalLinks className="flex flex-wrap gap-x-5 gap-y-2" />
          <p>{merchantDetails.legalName} · {merchantDetails.address} · <a className="hover:underline" href={`mailto:${merchantDetails.supportEmail}`}>{merchantDetails.supportEmail}</a>{merchantDetails.supportPhone ? ` · ${merchantDetails.supportPhone}` : ''}</p>
        </div>
      </footer>
    </div>
  );
}
