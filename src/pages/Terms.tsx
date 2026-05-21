import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <div className="shell stack legal-page">
      <h1>Terms of use</h1>
      <p className="legal-meta">Last updated: 12 May 2026 · TipGuard SA</p>
      <section className="card stack" style={{ fontSize: 14, textAlign: "left" }}>
        <p>
          TipGuard provides software to connect customers and car guards for voluntary tips. By using the service you
          agree to follow applicable South African law, your payment provider&apos;s terms (Paystack), and any rules
          your deployment operator publishes.
        </p>
        <p>
          Tips are discretionary. Ledger balances and payout flows depend on how your operator configures the product;
          nothing on this page constitutes financial or legal advice.
        </p>
        <p>
          Accounts must not be used for fraud, harassment, or unlawful activity. Operators may suspend access to
          protect users or meet compliance obligations.
        </p>
        <p style={{ marginBottom: 0 }}>
          For production deployments, replace this summary with counsel-reviewed terms linked from your marketing site.
        </p>
      </section>
      <Link to="/">Back to home</Link>
      <Link to="/privacy">Privacy</Link>
    </div>
  );
}
