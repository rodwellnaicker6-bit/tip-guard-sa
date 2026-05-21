import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getSupabaseBrowserConfigIssue, isSupabaseBrowserConfigured } from "../lib/supabase";
import { usePostAuthRedirect } from "../hooks/usePostAuthRedirect";
import PageLoader from "../components/PageLoader";
import { sanitizeDisplayName, sanitizeEmail } from "../lib/sanitize";

type RolePick = "customer" | "guard" | "merchant";
type Step = "account" | "verify-email";

/** Signup uses `emailRedirectTo` → `/auth/callback`; that full URL must be allowed in Supabase Dashboard → Authentication → Redirect URLs. */
export default function Register() {
  const { signUp, resendSignupEmail, user } = useAuth();
  const { showLoader } = usePostAuthRedirect({ preferOnboarding: true });
  const [step, setStep] = useState<Step>("account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<RolePick>("customer");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResendMsg(null);

    if (!isSupabaseBrowserConfigured) {
      const issue = getSupabaseBrowserConfigIssue();
      setError(
        import.meta.env.DEV
          ? issue === "placeholder"
            ? "Supabase env looks like .env.example placeholders: replace VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env with your project URL and anon key (Supabase Dashboard → Settings → API). Template values cannot reach your project."
            : "Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env (see .env.example). Without them the app falls back to a local placeholder URL and signup cannot reach your project."
          : "Sign-up is unavailable because the app is missing server configuration.",
      );
      return;
    }

    setSubmitting(true);
    const { error: err, needsEmailVerification } = await signUp(
      sanitizeEmail(email),
      password,
      sanitizeDisplayName(fullName),
      role,
    );
    if (!mountedRef.current) return;
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    if (needsEmailVerification) {
      setStep("verify-email");
      return;
    }
  }

  async function onResend() {
    setResendMsg(null);
    setError(null);
    setResendBusy(true);
    const { error: err } = await resendSignupEmail(email.trim());
    if (!mountedRef.current) return;
    setResendBusy(false);
    if (err) setError(err);
    else setResendMsg("Verification email sent again. Check your inbox and spam folder.");
  }

  if (user?.id && showLoader) {
    return <PageLoader />;
  }

  if (step === "verify-email") {
    return (
      <div className="shell stack">
        <h2>Verify your email</h2>
        <p>
          We sent a confirmation link to <strong style={{ color: "var(--text)" }}>{email}</strong>. Open it on this
          device to activate your account, then sign in.
        </p>
        <div className="card stack" style={{ fontSize: 14 }}>
          <p style={{ margin: 0 }}>
            Your operator must enable <strong>email confirmations</strong> in Supabase Auth for this step to appear
            after signup. See deploy docs for <code>enableConfirmations</code>.
          </p>
        </div>
        {resendMsg && <div className="success">{resendMsg}</div>}
        <button className="btn-ghost" type="button" disabled={resendBusy} onClick={() => void onResend()}>
          {resendBusy ? "Sending…" : "Resend verification email"}
        </button>
        <Link className="btn-gold" style={{ textAlign: "center", textDecoration: "none" }} to="/login">
          I have verified — sign in
        </Link>
        <button type="button" className="btn-ghost" onClick={() => setStep("account")}>
          Edit registration details
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="shell stack">
      <p className="muted-label" style={{ marginBottom: 0 }}>
        Step 1 of 3 · Account
      </p>
      <h2>Create account</h2>
      <p>Choose how you will use TipGuard, then add your details. After signup you will confirm your email (if enabled)
        and complete a short setup for your role. Business accounts start as customers in the database; you register a
        venue profile next, and an operator can grant the merchant role when verified.</p>
      <form className="stack mt" onSubmit={onSubmit}>
        <input
          className="field"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          disabled={submitting}
        />
        <input
          className="field"
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={submitting}
        />
        <input
          className="field"
          type="password"
          autoComplete="new-password"
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          disabled={submitting}
        />
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <label className="tap-target">
            <input
              type="radio"
              name="role"
              checked={role === "customer"}
              onChange={() => setRole("customer")}
              disabled={submitting}
            />{" "}
            Customer — tip guards
          </label>
          <label className="tap-target">
            <input type="radio" name="role" checked={role === "guard"} onChange={() => setRole("guard")} disabled={submitting} /> Car guard —
            receive tips
          </label>
          <label className="tap-target" style={{ flexBasis: "100%" }}>
            <input type="radio" name="role" checked={role === "merchant"} onChange={() => setRole("merchant")} disabled={submitting} /> Venue
            or business — register payouts and QR for your location
          </label>
        </div>
        <button className="btn-gold" type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Creating account…" : "Continue"}
        </button>
        {error && <div className="error">{error}</div>}
      </form>
      <Link to="/login">Already registered?</Link>
    </div>
  );
}
