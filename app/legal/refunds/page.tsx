import { LEGAL_EFFECTIVE_DATE, merchantDetails } from '@/lib/legal/merchant';

export default function RefundPolicyPage() {
  return (
    <article className="prose prose-slate max-w-none rounded-xl border bg-white p-6 sm:p-9">
      <h1>Refund, Cancellation, and Digital Delivery Policy</h1><p><strong>Effective:</strong> {LEGAL_EFFECTIVE_DATE}</p>
      <h2>Digital delivery</h2><p>StockIntel subscriptions provide digital access, not physical delivery. Paid features are enabled after Paystack confirms a successful transaction and our server verifies the reference, plan, amount, and currency. This is normally immediate. Report delayed access to <a href={`mailto:${merchantDetails.supportEmail}`}>{merchantDetails.supportEmail}</a> with the transaction reference.</p>
      <h2>Cancellation</h2><p>Workspace owners can cancel renewal from Billing through Paystack’s hosted subscription management page. Cancellation stops future renewal. Unless a refund is approved, the workspace keeps paid access until the current period ends. Deleting an account does not by itself cancel an external subscription.</p>
      <h2>Refund eligibility</h2><p>Contact us promptly if you were charged more than once, charged the wrong amount, charged after a confirmed cancellation, or could not receive the purchased service because of a fault we could not resolve. Refunds are not normally provided for unused time, failure to cancel before renewal, or reduced use of an otherwise available service, except where applicable law requires otherwise.</p>
      <h2>How to request a refund</h2><p>Email <a href={`mailto:${merchantDetails.supportEmail}`}>{merchantDetails.supportEmail}</a> with the workspace name, account email, Paystack reference, payment date, amount, and reason. Do not send card numbers, PINs, CVVs, passwords, or one-time codes. We normally acknowledge requests within two business days and aim to decide them within five business days.</p>
      <h2>Approved refunds</h2><p>Approved full or partial refunds are initiated through Paystack to the original payment route where possible. Paystack and the customer’s financial institution control the final processing time. We will update subscription access consistently with the refunded service period and provide a status update if processing requires additional information.</p>
      <h2>Disputes</h2><p>Please contact us first so we can investigate and preserve service and payment evidence. This policy does not restrict chargeback rights or mandatory consumer protections. {merchantDetails.legalName} is responsible for StockIntel customer service and dispute resolution.</p>
    </article>
  );
}
