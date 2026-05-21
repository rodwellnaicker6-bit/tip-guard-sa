import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export default function ForgotPassword() {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await resetPasswordForEmail(email.trim());
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setSent(true);
  }

  return (
    <div className="shell stack">
      <h2>Forgot password</h2>
      <p>
        Enter the email on your TipGuard account. We will send a single-use link to set a new password. The link expires
        after a short time for security.
      </p>
      <form className="stack mt" onSubmit={onSubmit}>
        <input
          className="field"
          type="email"
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={busy || sent}
        />
        {error && <div className="error">{error}</div>}
        {sent && (
          <div className="success">
            If an account exists for that address, you will receive an email shortly. Check spam folders and request
            another link if nothing arrives.
          </div>
        )}
        <button className="btn-gold tap-target" type="submit" disabled={sent || busy} aria-busy={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <Link to="/login">Back to sign in</Link>
    </div>
  );
}
