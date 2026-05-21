import { LegalPageLayout } from "../components/LegalPageLayout";

export default function PopiaNotice() {
  return (
    <LegalPageLayout title="POPIA notice" updated="20 May 2026">
      <p>
        TipGuard SA processes personal information as a responsible party under the Protection of Personal Information Act
        4 of 2013 (POPIA). This notice describes how we handle information when you use our tipping platform in South
        Africa.
      </p>
      <h2 className="text-base font-bold text-white">What we collect</h2>
      <p>
        Account details (name, email, phone where provided), role and profile data, tip and wallet transaction metadata,
        device/browser technical logs for security, and KYC documents where merchants or guards complete verification.
      </p>
      <h2 className="text-base font-bold text-white">Why we process it</h2>
      <p>
        To operate tips and payouts, prevent fraud, comply with financial crime obligations, support you, and improve the
        service. Payment card data is processed by Paystack; we do not store full card numbers on TipGuard servers.
      </p>
      <h2 className="text-base font-bold text-white">Your rights</h2>
      <p>
        You may request access, correction, or deletion of personal information, subject to legal retention requirements.
        Contact your deployment operator&apos;s information officer at the address published on your production site.
      </p>
      <h2 className="text-base font-bold text-white">Cross-border transfers</h2>
      <p>
        Supabase and Paystack may process data outside South Africa under appropriate safeguards. Operators should document
        subprocessors in their privacy policy before go-live.
      </p>
    </LegalPageLayout>
  );
}
