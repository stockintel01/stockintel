import { LEGAL_EFFECTIVE_DATE, merchantDetails } from '@/lib/legal/merchant';

export default function TermsPage() {
  return (
    <article className="prose prose-slate max-w-none rounded-xl border bg-white p-6 sm:p-9">
      <h1>StockIntel Agri Terms of Service</h1><p><strong>Effective:</strong> {LEGAL_EFFECTIVE_DATE}</p>
      <p>These terms are between you and {merchantDetails.legalName} (“StockIntel”, “we”, or “us”). By creating an account or purchasing a subscription, you agree to these terms.</p>
      <h2>1. The service</h2><p>StockIntel provides tenant-separated agricultural operations software. Features depend on the selected plan, configured modules, permissions, and availability described at purchase. The subscription does not include physical products, farm labour, agronomic certification, regulated financial advice, or guaranteed production outcomes.</p>
      <h2>2. Accounts and workspaces</h2><p>Workspace owners are responsible for authorized users, accurate organization details, role assignments, lawful data entry, and keeping credentials secure. You must promptly notify us of suspected unauthorized access.</p>
      <h2>3. Trials, prices, and recurring billing</h2><p>Trial access ends on the date shown in Billing. A trial does not automatically charge a payment method. When an owner chooses a paid monthly plan, the price, currency, billing interval, and included features are shown before Paystack checkout. By completing checkout, the owner authorizes the displayed recurring charge until cancellation. Taxes or payment-provider fees are handled as disclosed at checkout or required by law.</p>
      <h2>4. Cancellation</h2><p>An owner may open Billing and use Paystack’s hosted subscription management page to update the payment method or cancel renewal. Unless a refund is approved or law requires otherwise, access continues through the paid period and ends afterwards.</p>
      <h2>5. Acceptable use</h2><p>You may not use StockIntel or its payment flow for unlawful activity, fraud, sanctions evasion, prohibited or restricted business, payment aggregation, resale of payment processing, abuse, unauthorized access, malware, or infringement of another person’s rights. We may suspend access where reasonably necessary to protect customers, comply with law, investigate fraud, or satisfy payment-network requirements.</p>
      <h2>6. Customer data</h2><p>You retain responsibility for the lawfulness and accuracy of data uploaded to your workspace. Our handling of personal data is described in the Privacy Policy. Export important operational records regularly and keep any records your organization is legally required to retain.</p>
      <h2>7. Availability and changes</h2><p>We work to keep the service available and secure, but maintenance, internet failures, third-party outages, or emergencies can interrupt access. We may improve features and security controls while preserving paid core functionality during the current billing period.</p>
      <h2>8. Liability</h2><p>To the extent permitted by applicable law, StockIntel is provided without guarantees of uninterrupted operation or specific agricultural outcomes. Nothing in these terms excludes rights or liabilities that cannot lawfully be excluded.</p>
      <h2>9. Support and disputes</h2><p>Contact <a href={`mailto:${merchantDetails.supportEmail}`}>{merchantDetails.supportEmail}</a>{merchantDetails.supportPhone ? ` or ${merchantDetails.supportPhone}` : ''}. We are responsible for resolving complaints about the StockIntel service. These terms are governed by applicable Ghanaian law, without limiting mandatory consumer rights in another applicable jurisdiction.</p>
    </article>
  );
}
