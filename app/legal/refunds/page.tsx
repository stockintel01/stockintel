import { BadgeDollarSign } from 'lucide-react';

import { LegalDocument, LegalText } from '@/components/legal/LegalDocument';
import { LEGAL_EFFECTIVE_DATE, merchantDetails } from '@/lib/legal/merchant';

export default function RefundPolicyPage() {
  return (
    <LegalDocument
      eyebrow="Refunds and cancellation"
      title="A straightforward path for billing concerns"
      description="How digital delivery, subscription cancellation, duplicate charges, refund requests, and payment disputes are handled."
      effectiveDate={LEGAL_EFFECTIVE_DATE}
      icon={<BadgeDollarSign className="h-6 w-6" aria-hidden="true" />}
      sections={[
        { id: 'delivery', title: 'Digital delivery', content: <LegalText>StockIntel subscriptions provide digital access, not physical delivery. Paid features are enabled after Paystack confirms a successful transaction and our server verifies the reference, plan, amount, and currency. This is normally immediate. Report delayed access to <a className="font-medium text-emerald-800 hover:underline" href={`mailto:${merchantDetails.supportEmail}`}>{merchantDetails.supportEmail}</a> with the transaction reference.</LegalText> },
        { id: 'cancellation', title: 'Cancellation', content: <LegalText>Workspace owners can cancel renewal from Billing through Paystack&apos;s hosted subscription management page. Cancellation stops future renewal. Unless a refund is approved, the workspace keeps paid access until the current period ends. Deleting an account does not by itself cancel an external subscription.</LegalText> },
        { id: 'eligibility', title: 'Refund eligibility', content: <LegalText>Contact us promptly if you were charged more than once, charged the wrong amount, charged after a confirmed cancellation, or could not receive the purchased service because of a fault we could not resolve. Refunds are not normally provided for unused time, failure to cancel before renewal, or reduced use of an otherwise available service, except where applicable law requires otherwise.</LegalText> },
        { id: 'request', title: 'How to request a refund', content: <LegalText>Email <a className="font-medium text-emerald-800 hover:underline" href={`mailto:${merchantDetails.supportEmail}`}>{merchantDetails.supportEmail}</a> with the workspace name, account email, Paystack reference, payment date, amount, and reason. Do not send card numbers, PINs, CVVs, passwords, or one-time codes. We normally acknowledge requests within two business days and aim to decide them within five business days.</LegalText> },
        { id: 'approved', title: 'Approved refunds', content: <LegalText>Approved full or partial refunds are initiated through Paystack to the original payment route where possible. Paystack and the customer&apos;s financial institution control the final processing time. We will update subscription access consistently with the refunded service period and provide a status update if processing requires additional information.</LegalText> },
        { id: 'disputes', title: 'Disputes', content: <LegalText>Please contact us first so we can investigate and preserve service and payment evidence. This policy does not restrict chargeback rights or mandatory consumer protections. {merchantDetails.legalName} is responsible for StockIntel customer service and dispute resolution.</LegalText> },
      ]}
    />
  );
}
