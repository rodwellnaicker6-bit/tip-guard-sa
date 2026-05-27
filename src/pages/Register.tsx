import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getSupabaseBrowserConfigIssue, isSupabaseBrowserConfigured } from "../lib/supabase";
import { usePostAuthRedirect } from "../hooks/usePostAuthRedirect";
import PageLoader from "../components/PageLoader";
import { sanitizeDisplayName, sanitizeEmail } from "../lib/sanitize";
import { AuthShell } from "../components/AuthShell";

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
    try {
      const { error: err, needsEmailVerification } = await signUp(
        sanitizeEmail(email),
        password,
        sanitizeDisplayName(fullName),
        role,
      );
      if (!mountedRef.current) return;
      if (err) {
        setError(err);
        return;
      }
      if (needsEmailVerification) {
        setStep("verify-email");
      }
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  async function onResend() {
    setResendMsg(null);
    setError(null);
    setResendBusy(true);
    try {
      const { error: err } = await resendSignupEmail(email.trim());
      if (!mountedRef.current) return;
      if (err) setError(err);
      else setResendMsg("Verification email sent again. Check your inbox and spam folder.");
    } finally {
      if (mountedRef.current) setResendBusy(false);
    }
  }

  if (user?.id && showLoader) {
    return <PageLoader />;
  }

  if (step === "verify-email") {
    return (
      <AuthShell
        title="Verify your email"
        subtitle={`We sent a confirmation link to ${email}. Open it on this device to activate your account, then sign in.`}
        footer={
          <>
            <Link to="/login">I have verified — sign in</Link>
            <button type="button" className="auth-footer-link-btn" onClick={() => setStep("account")}>
              Edit registration details
            </button>
          </>
        }
      >
        <p className="glass-card-copy text-left">
          Your operator must enable <strong className="text-slate-200">email confirmations</strong> in Supabase Auth for
          this step to appear after signup.
        </p>
        {resendMsg && <div className="success">{resendMsg}</div>}
        <button className="btn-ghost tap-target" type="button" disabled={resendBusy} onClick={() => void onResend()}>
          {resendBusy ? "Sending…" : "Resend verification email"}
        </button>
        {error && <div className="error">{error}</div>}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Step 1 of 3 · Choose how you will use TipGuard, then add your details."
      footer={
        <>
          <Link to="/login">Already registered?</Link>
          <Link to="/">Home</Link>
        </>
      }
    >
      <form className="stack" onSubmit={onSubmit}>
        <input
          className="field tap-target"
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          disabled={submitting}
        />
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
          disabled={submitting}
        />
        <input
          className="field tap-target"
          type="password"
          name="new-password"
          autoComplete="new-password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          disabled={submitting}
        />
        <fieldset className="role-picker" disabled={submitting}>
          <legend className="muted-label">I am signing up as</legend>
          <label className="role-picker__option tap-target">
            <input type="radio" name="role" checked={role === "customer"} onChange={() => setRole("customer")} />
            <span>Customer — tip guards</span>
          </label>
          <label className="role-picker__option tap-target">
            <input type="radio" name="role" checked={role === "guard"} onChange={() => setRole("guard")} />
            <span>Car guard — receive tips</span>
          </label>
          <label className="role-picker__option tap-target">
            <input type="radio" name="role" checked={role === "merchant"} onChange={() => setRole("merchant")} />
            <span>Venue or business — payouts and QR</span>
          </label>
        </fieldset>
        <button
          className={`btn-gold btn-gold--shine tap-target ${submitting ? "btn-gold--loading" : ""}`}
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? (
            <span className="btn-gold-inner">
              <span className="btn-spinner" aria-hidden />
              Creating account…
            </span>
          ) : (
            "Continue"
          )}
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    </AuthShell>
  );
}
