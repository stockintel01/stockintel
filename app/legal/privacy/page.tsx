import { LEGAL_EFFECTIVE_DATE, merchantDetails } from '@/lib/legal/merchant';

export default function PrivacyPage() {
  return (
    <article className="prose prose-slate max-w-none rounded-xl border bg-white p-6 sm:p-9">
      <h1>Privacy Policy</h1><p><strong>Effective:</strong> {LEGAL_EFFECTIVE_DATE}</p>
      <p>{merchantDetails.legalName} controls the personal data used to provide StockIntel Agri. This policy explains our processing under applicable privacy law, including Ghana’s Data Protection Act, 2012.</p>
      <h2>Information we use</h2><p>We process account and contact details, workspace membership and permissions, tenant settings, operational farm records, support communications, device and security logs, subscription status, payment references, amounts, currency, and limited payment metadata returned by Paystack. We do not store full card numbers, PINs, or CVVs.</p>
      <h2>Why we use it</h2><p>We use data to authenticate users, deliver tenant-scoped features, process subscriptions, prevent fraud, provide support, maintain audit trails, improve reliability, communicate service notices, and meet legal, tax, accounting, dispute, and security obligations.</p>
      <h2>Recipients and international processing</h2><p>We share only what is needed with contracted infrastructure, authentication, communications, analytics, support, and payment providers. Paystack receives payment and customer information required to process transactions, manage subscriptions, prevent fraud, settle funds, and meet regulatory duties. Providers may process data in other countries under their contractual and legal safeguards.</p>
      <h2>Retention</h2><p>Workspace data is retained while the account is active and for a limited period needed for recovery, disputes, security, and legal obligations. Payment, consent, audit, and transaction records may be retained longer where financial, anti-fraud, tax, chargeback, or regulatory rules require it. Deleting a workspace does not erase records we must lawfully retain.</p>
      <h2>Security and tenant separation</h2><p>We use authentication, role-based permissions, database row-level controls, encrypted transport, server-only payment credentials, signed webhook verification, logging, and restricted administrative access. No internet service can promise absolute security.</p>
      <h2>Your choices and rights</h2><p>You may request access, correction, export, restriction, objection, or deletion where applicable. Workspace owners can edit much of their organization’s data directly. Send privacy requests to <a href={`mailto:${merchantDetails.supportEmail}`}>{merchantDetails.supportEmail}</a>. We may verify identity and retain information that law requires us to keep.</p>
      <h2>Cookies and local storage</h2><p>We use essential session, security, preference, and offline-storage technologies needed to sign users in and run the installed web application. Optional analytics should only be enabled according to the choices and notices applicable to the deployment.</p>
    </article>
  );
}
