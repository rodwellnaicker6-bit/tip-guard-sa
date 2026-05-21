import { LegalPageLayout } from "../components/LegalPageLayout";

export default function CookiesPolicy() {
  return (
    <LegalPageLayout title="Cookie policy" updated="20 May 2026">
      <p>
        TipGuard uses essential cookies and browser storage to keep you signed in (Supabase session), remember display
        preferences, and protect against abuse. We do not use third-party advertising cookies in the default product build.
      </p>
      <h2 className="text-base font-bold text-white">Essential storage</h2>
      <ul className="list-disc space-y-2 pl-5 text-slate-300">
        <li>Authentication session tokens (Supabase)</li>
        <li>Theme and high-contrast preferences (localStorage)</li>
        <li>Checkout return paths during Paystack redirect flows (sessionStorage)</li>
      </ul>
      <h2 className="text-base font-bold text-white">Analytics (optional)</h2>
      <p>
        Production deployments may enable privacy-friendly analytics or error monitoring (e.g. Sentry) via environment
        variables. Operators should disclose these tools in their privacy policy and obtain consent where required.
      </p>
      <h2 className="text-base font-bold text-white">Managing cookies</h2>
      <p>
        You can clear site data in your browser settings; you will need to sign in again. Blocking essential cookies will
        prevent the app from working.
      </p>
    </LegalPageLayout>
  );
}
