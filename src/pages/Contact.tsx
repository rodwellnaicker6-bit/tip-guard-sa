import { LegalPageLayout } from "../components/LegalPageLayout";

const supportEmail =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || "support@tipguard.co.za";

export default function Contact() {
  return (
    <LegalPageLayout title="Contact" updated="22 May 2026">
      <p>
        For account, tipping, payout, or POPIA requests, contact the TipGuard operator team. We respond to production
        incidents and merchant onboarding within one business day where possible.
      </p>
      <p>
        <strong className="text-white">Email:</strong>{" "}
        <a href={`mailto:${supportEmail}`} className="text-amber-300 underline">
          {supportEmail}
        </a>
      </p>
      <p className="text-sm text-slate-400">
        Payment disputes: include your Paystack reference from the receipt. Venue operators handle refunds per the{" "}
        <a href="/legal/refunds" className="text-amber-300 underline">
          refund policy
        </a>
        .
      </p>
    </LegalPageLayout>
  );
}
