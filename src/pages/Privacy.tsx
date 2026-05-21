import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="shell stack legal-page">
      <h1>Privacy</h1>
      <p className="legal-meta">Last updated: 12 May 2026 · TipGuard SA</p>
      <section className="card stack" style={{ fontSize: 14, textAlign: "left" }}>
        <p>
          The app processes account data (for example email and profile fields) and payment metadata required to operate
          tips and wallet top-ups. Payments are handled by Paystack; refer to their privacy notice for card and
          transaction processing.
        </p>
        <p>
          Your Supabase project operator controls retention, access logs, and data subject requests. Row-level security
          limits what each role can read in the database.
        </p>
        <p style={{ marginBottom: 0 }}>
          Replace this overview with a jurisdiction-appropriate privacy policy before marketing to the public.
        </p>
      </section>
      <Link to="/">Back to home</Link>
      <Link to="/terms">Terms</Link>
    </div>
  );
}
