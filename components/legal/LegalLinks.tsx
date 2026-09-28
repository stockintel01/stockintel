import Link from 'next/link';

export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="Legal and customer information" className={className}>
      <Link className="hover:underline" href="/legal">Customer information</Link>
      <Link className="hover:underline" href="/legal/terms">Terms</Link>
      <Link className="hover:underline" href="/legal/privacy">Privacy</Link>
      <Link className="hover:underline" href="/legal/refunds">Refunds & cancellation</Link>
    </nav>
  );
}
