import { Link } from "react-router-dom";

export default function GuardConnect() {
  return (
    <div className="shell stack">
      <h2>Guard payouts</h2>
      <p>
        Guard balances are tracked in TipGuard. Bank payouts are coordinated outside this screen (for example batch
        transfers or a future Paystack Transfers integration aligned with your compliance process).
      </p>
      <div className="card" style={{ fontSize: 14, color: "var(--muted)" }}>
        For production, align payout timing, KYC, and statements with Paystack South Africa guidance and your finance
        team. This page explains the current scope after the Stripe → Paystack migration.
      </div>
      <Link className="btn-gold tap-target" style={{ textAlign: "center", textDecoration: "none" }} to="/guard">
        Back to dashboard
      </Link>
      <Link to="/">Home</Link>
    </div>
  );
}
