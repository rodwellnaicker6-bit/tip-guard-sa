import { LegalPageLayout } from "../components/LegalPageLayout";

export default function MerchantOnboardingLegal() {
  return (
    <LegalPageLayout title="Merchant onboarding" updated="20 May 2026">
      <p>
        Venues using TipGuard agree to onboard guards lawfully, display tipping QR codes clearly, and comply with South
        African labour, tax, and anti-money-laundering requirements applicable to their business.
      </p>
      <h2 className="text-base font-bold text-white">KYC & verification</h2>
      <p>
        Merchants may be asked for business registration, proof of address, and authorised representative ID. Guards linked
        to your venue must complete profile setup before receiving tips. Verification status is shown in the merchant
        dashboard.
      </p>
      <h2 className="text-base font-bold text-white">Fees & payouts</h2>
      <p>
        Platform and payment fees are defined in your commercial agreement with the TipGuard operator. Payout timing
        depends on Paystack settlement and your configured payout requests (see post-MVP payout reports in product
        roadmap).
      </p>
      <h2 className="text-base font-bold text-white">Acceptable use</h2>
      <p>
        Do not use TipGuard for tips linked to unlawful activity, harassment, or misrepresentation of guard identity.
        Operators may suspend venues that breach these rules or PCI-DSS handling requirements.
      </p>
      <p>
        Complete technical setup at <strong>/merchant/setup</strong> after creating a merchant account.
      </p>
    </LegalPageLayout>
  );
}
