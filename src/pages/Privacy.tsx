import { LegalPageLayout } from "../components/LegalPageLayout";

export default function Privacy() {
  return (
    <LegalPageLayout title="Privacy policy" updated="20 May 2026">
      <p>
        This policy explains how TipGuard SA processes personal information when you use our tipping platform. For POPIA
        rights and the information officer contact, see our <a href="/legal/popia">POPIA notice</a>.
      </p>
      <h2 className="text-base font-bold text-white">Information we process</h2>
      <ul className="list-disc space-y-2 pl-5 text-slate-300">
        <li>Account: email, name, phone (if provided), role</li>
        <li>Transactions: tip amounts, timestamps, Paystack references (not full card numbers)</li>
        <li>Guard/merchant profiles: display name, location, verification status</li>
        <li>Technical: logs, device type, IP for security</li>
      </ul>
      <h2 className="text-base font-bold text-white">How we use it</h2>
      <p>
        To operate tips and wallets, prevent fraud, provide support, improve the product, and meet legal obligations.
        Payment card processing is performed by Paystack under their privacy policy.
      </p>
      <h2 className="text-base font-bold text-white">Sharing</h2>
      <p>
        We use Supabase (hosting/database), Paystack (payments), and optional monitoring tools configured by your
        operator (e.g. Sentry). We do not sell personal information.
      </p>
      <h2 className="text-base font-bold text-white">Retention & security</h2>
      <p>
        Data is retained as needed for operations and law. Row-level security limits database access by role. You are
        responsible for keeping your password confidential.
      </p>
      <h2 className="text-base font-bold text-white">Cookies</h2>
      <p>
        See our <a href="/legal/cookies">cookie policy</a> for browser storage used by the app.
      </p>
    </LegalPageLayout>
  );
}
