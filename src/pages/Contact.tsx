import { LegalPageLayout } from "../components/LegalPageLayout";
import { BusinessContactBlock } from "../components/BusinessContactBlock";

export default function Contact() {
  return (
    <LegalPageLayout title="Contact" updated="27 May 2026">
      <p>
        For account, tipping, payout, or POPIA requests, contact the TipGuard operator team. We respond to production
        incidents and merchant onboarding within one business day where possible.
      </p>
      <BusinessContactBlock />
      <p className="text-sm text-slate-400">
        Payment disputes: include your Paystack reference from the receipt. Venue operators handle refunds per the{" "}
        <a href="/legal/refunds" className="text-amber-300 underline">
          refund policy
        </a>
        . Tips are delivered digitally to guards after Paystack confirms payment — see refunds for failed charges.
      </p>
    </LegalPageLayout>
  );
}
