import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { sanitizeEmail } from "../lib/sanitize";
import { AuthShell } from "../components/AuthShell";

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
    const { error: err } = await resetPasswordForEmail(sanitizeEmail(email));
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="We will email a single-use link to set a new password. The link expires after a short time for security."
      footer={
        <>
          <Link to="/login">Back to sign in</Link>
          <Link to="/">Home</Link>
        </>
      }
    >
      <form className="stack" onSubmit={onSubmit}>
        <input
          className="field tap-target"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
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
    </AuthShell>
  );
}
