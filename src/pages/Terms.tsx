import { LegalPageLayout } from "../components/LegalPageLayout";

export default function Terms() {
  return (
    <LegalPageLayout title="Terms of use" updated="20 May 2026">
      <p>
        These terms govern your use of TipGuard SA software and related services operated in South Africa. By creating an
        account or sending a tip you agree to these terms and to Paystack&apos;s payment terms where applicable.
      </p>
      <h2 className="text-base font-bold text-white">The service</h2>
      <p>
        TipGuard connects customers with car guards and venue operators for voluntary digital tips. We provide software
        only; we are not a bank, insurer, or employer of guards unless your operator states otherwise in a separate
        agreement.
      </p>
      <h2 className="text-base font-bold text-white">Accounts & roles</h2>
      <p>
        You must provide accurate registration information. Customer, guard, merchant, and admin roles carry different
        permissions. You may not attempt to escalate privileges or access data belonging to other users.
      </p>
      <h2 className="text-base font-bold text-white">Payments</h2>
      <p>
        Tips and wallet top-ups are processed by Paystack. Successful charges are generally non-refundable except as
        described in our <a href="/legal/refunds">refunds policy</a> or required by law.
      </p>
      <h2 className="text-base font-bold text-white">Acceptable use</h2>
      <p>
        Do not use the platform for fraud, money laundering, harassment, or unlawful activity. We may suspend accounts to
        protect users or meet compliance obligations.
      </p>
      <h2 className="text-base font-bold text-white">Liability</h2>
      <p>
        The service is provided &quot;as is&quot; to the extent permitted by law. Operators deploying TipGuard should maintain
        appropriate insurance and employment arrangements with guards.
      </p>
      <p>Operators should replace this template with counsel-reviewed terms before public marketing.</p>
    </LegalPageLayout>
  );
}
