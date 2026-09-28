import { FileText } from 'lucide-react';

import { LegalDocument, LegalText } from '@/components/legal/LegalDocument';
import { LEGAL_EFFECTIVE_DATE, merchantDetails } from '@/lib/legal/merchant';

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Terms of service"
      title="Clear terms for using StockIntel"
      description={`These terms are between you and ${merchantDetails.legalName} ("StockIntel", "we", or "us"). By creating an account or purchasing a subscription, you agree to these terms.`}
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      icon={<FileText className="h-6 w-6" aria-hidden="true" />}
      sections={[
        { id: 'service', title: 'The service', content: <LegalText>StockIntel provides tenant-separated agricultural operations software. Features depend on the selected plan, configured modules, permissions, and availability described at purchase. The subscription does not include physical products, farm labour, agronomic certification, regulated financial advice, or guaranteed production outcomes.</LegalText> },
        { id: 'accounts', title: 'Accounts and workspaces', content: <LegalText>Workspace owners are responsible for authorized users, accurate organization details, role assignments, lawful data entry, and keeping credentials secure. You must promptly notify us of suspected unauthorized access.</LegalText> },
        { id: 'billing', title: 'Trials, prices, and recurring billing', content: <LegalText>Trial access ends on the date shown in Billing. A trial does not automatically charge a payment method. When an owner chooses a paid monthly plan, the price, currency, billing interval, and included features are shown before Paystack checkout. By completing checkout, the owner authorizes the displayed recurring charge until cancellation. Taxes or payment-provider fees are handled as disclosed at checkout or required by law.</LegalText> },
        { id: 'cancellation', title: 'Cancellation', content: <LegalText>An owner may open Billing and use Paystack&apos;s hosted subscription management page to update the payment method or cancel renewal. Unless a refund is approved or law requires otherwise, access continues through the paid period and ends afterwards.</LegalText> },
        { id: 'acceptable-use', title: 'Acceptable use', content: <LegalText>You may not use StockIntel or its payment flow for unlawful activity, fraud, sanctions evasion, prohibited or restricted business, payment aggregation, resale of payment processing, abuse, unauthorized access, malware, or infringement of another person&apos;s rights. We may suspend access where reasonably necessary to protect customers, comply with law, investigate fraud, or satisfy payment-network requirements.</LegalText> },
        { id: 'customer-data', title: 'Customer data', content: <LegalText>You retain responsibility for the lawfulness and accuracy of data uploaded to your workspace. Our handling of personal data is described in the Privacy Policy. Export important operational records regularly and keep any records your organization is legally required to retain.</LegalText> },
        { id: 'availability', title: 'Availability and changes', content: <LegalText>We work to keep the service available and secure, but maintenance, internet failures, third-party outages, or emergencies can interrupt access. We may improve features and security controls while preserving paid core functionality during the current billing period.</LegalText> },
        { id: 'liability', title: 'Liability', content: <LegalText>To the extent permitted by applicable law, StockIntel is provided without guarantees of uninterrupted operation or specific agricultural outcomes. Nothing in these terms excludes rights or liabilities that cannot lawfully be excluded.</LegalText> },
        { id: 'disputes', title: 'Support and disputes', content: <LegalText>Contact <a className="font-medium text-emerald-800 hover:underline" href={`mailto:${merchantDetails.supportEmail}`}>{merchantDetails.supportEmail}</a>{merchantDetails.supportPhone ? ` or ${merchantDetails.supportPhone}` : ''}. We are responsible for resolving complaints about the StockIntel service. These terms are governed by applicable Ghanaian law, without limiting mandatory consumer rights in another applicable jurisdiction.</LegalText> },
      ]}
    />
  );
}
