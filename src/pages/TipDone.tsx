import { Link, useLocation, useSearchParams } from "react-router-dom";
import { zarFromCents } from "../lib/money";

export default function TipDone() {
  const location = useLocation();
  const [params] = useSearchParams();
  const canceled = params.get("canceled") === "1";
  const sessionComplete = params.get("session") === "complete";
  const amountCentsRaw = params.get("amount_cents");
  const amountCents = amountCentsRaw != null ? Number(amountCentsRaw) : NaN;
  const guardNameQ = params.get("guard_name");

  const state = location.state as { amountLabel?: string; guardName?: string } | null;
  const amountLabel = state?.amountLabel ?? (Number.isFinite(amountCents) ? zarFromCents(amountCents) : undefined);
  const guardName = state?.guardName ?? guardNameQ ?? undefined;

  if (canceled) {
    return (
      <div className="shell stack" style={{ textAlign: "center" }}>
        <h2>Payment canceled</h2>
        <p style={{ color: "var(--muted)" }}>
          {guardName ? `No charge was made to tip ${guardName}.` : "No charge was made."}
        </p>
        <Link className="btn-gold" style={{ display: "block", textDecoration: "none" }} to="/customer">
          Back to guards
        </Link>
      </div>
    );
  }

  const showReceipt = sessionComplete || Boolean(amountLabel);

  return (
    <div className="shell stack" style={{ textAlign: "center" }}>
      <h2 style={{ color: "var(--green)" }}>Thank you</h2>
      {showReceipt && (
        <div className="card stack" style={{ textAlign: "left", maxWidth: 420, margin: "0 auto" }}>
          <h3 style={{ marginTop: 0 }}>Receipt</h3>
          {guardName && (
            <p>
              <strong>Guard:</strong> {guardName}
            </p>
          )}
          {amountLabel && (
            <p>
              <strong>Amount:</strong> {amountLabel}
            </p>
          )}
          {!amountLabel && sessionComplete && (
            <p style={{ color: "var(--muted)" }}>
              Amount details were not included in the return URL; check your email or payment receipt.
            </p>
          )}
        </div>
      )}
      <p>
        {showReceipt
          ? "Your payment was submitted. The guard’s balance updates automatically once processing completes on the server."
          : "Payment flow completed. Paystack may redirect you back here depending on the payment channel."}
      </p>
      <Link className="btn-gold" style={{ display: "block", textDecoration: "none" }} to="/customer">
        Back to guards
      </Link>
    </div>
  );
}
