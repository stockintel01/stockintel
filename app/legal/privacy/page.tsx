import { ShieldCheck } from 'lucide-react';

import { LegalDocument, LegalText } from '@/components/legal/LegalDocument';
import { LEGAL_EFFECTIVE_DATE, merchantDetails } from '@/lib/legal/merchant';

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Privacy policy"
      title="Your data, handled with care"
      description={`${merchantDetails.legalName} controls the personal data used to provide StockIntel Agri. This policy explains our processing under applicable privacy law, including Ghana's Data Protection Act, 2012.`}
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      icon={<ShieldCheck className="h-6 w-6" aria-hidden="true" />}
      sections={[
        { id: 'information', title: 'Information we use', content: <LegalText>We process account and contact details, workspace membership and permissions, tenant settings, operational farm records, support communications, device and security logs, subscription status, payment references, amounts, currency, and limited payment metadata returned by Paystack. We do not store full card numbers, PINs, or CVVs.</LegalText> },
        { id: 'purposes', title: 'Why we use it', content: <LegalText>We use data to authenticate users, deliver tenant-scoped features, process subscriptions, prevent fraud, provide support, maintain audit trails, improve reliability, communicate service notices, and meet legal, tax, accounting, dispute, and security obligations.</LegalText> },
        { id: 'recipients', title: 'Recipients and international processing', content: <LegalText>We share only what is needed with contracted infrastructure, authentication, communications, analytics, support, and payment providers. Paystack receives payment and customer information required to process transactions, manage subscriptions, prevent fraud, settle funds, and meet regulatory duties. Providers may process data in other countries under their contractual and legal safeguards.</LegalText> },
        { id: 'retention', title: 'Retention', content: <LegalText>Workspace data is retained while the account is active and for a limited period needed for recovery, disputes, security, and legal obligations. Payment, consent, audit, and transaction records may be retained longer where financial, anti-fraud, tax, chargeback, or regulatory rules require it. Deleting a workspace does not erase records we must lawfully retain.</LegalText> },
        { id: 'security', title: 'Security and tenant separation', content: <LegalText>We use authentication, role-based permissions, database row-level controls, encrypted transport, server-only payment credentials, signed webhook verification, logging, and restricted administrative access. No internet service can promise absolute security.</LegalText> },
        { id: 'rights', title: 'Your choices and rights', content: <LegalText>You may request access, correction, export, restriction, objection, or deletion where applicable. Workspace owners can edit much of their organization&apos;s data directly. Send privacy requests to <a className="font-medium text-emerald-800 hover:underline" href={`mailto:${merchantDetails.supportEmail}`}>{merchantDetails.supportEmail}</a>. We may verify identity and retain information that law requires us to keep.</LegalText> },
        { id: 'storage', title: 'Cookies and local storage', content: <LegalText>We use essential session, security, preference, and offline-storage technologies needed to sign users in and run the installed web application. Optional analytics should only be enabled according to the choices and notices applicable to the deployment.</LegalText> },
      ]}
    />
  );
}
