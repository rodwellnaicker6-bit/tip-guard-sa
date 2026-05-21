import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { usePostAuthRedirect } from "../hooks/usePostAuthRedirect";
import PageLoader from "../components/PageLoader";
import { AuthShell } from "../components/AuthShell";
import { DEMO_ACCOUNTS, isDemoMode } from "../lib/demoMode";

export default function Login() {
  const { signIn, user } = useAuth();
  const location = useLocation();
  const passwordUpdated = Boolean((location.state as { passwordUpdated?: boolean } | null)?.passwordUpdated);
  const redirectFrom = useMemo(
    () => (location.state as { from?: string } | null)?.from,
    [location.state],
  );
  const { showLoader } = usePostAuthRedirect({ from: redirectFrom });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
    setSubmitting(true);
    const { error: err } = await signIn(email, password);
    if (!mountedRef.current) return;
    setSubmitting(false);
    if (err) setError(err);
  }

  if (user?.id && showLoader) {
    return <PageLoader />;
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in with the email and password you registered with."
      footer={
        <>
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/register">Create account</Link>
          <Link to="/">Home</Link>
        </>
      }
    >
      {passwordUpdated && <div className="success">Password updated. Sign in with your new password.</div>}
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
          disabled={submitting}
        />
        <input
          className="field tap-target"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={submitting}
        />
        {error && <div className="error">{error}</div>}
        <button
          className={`btn-gold btn-gold--shine tap-target ${submitting ? "btn-gold--loading" : ""}`}
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? (
            <span className="btn-gold-inner">
              <span className="btn-spinner" aria-hidden />
              Signing in…
            </span>
          ) : (
            "Continue"
          )}
        </button>
      </form>
      {isDemoMode && (
        <section className="card">
          <p className="muted-label" style={{ marginBottom: 4 }}>
            Staging demo
          </p>
          <p className="text-sm text-slate-400">One-click sign-in after <code>npm run seed:demo</code>.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["admin", "merchant", "guard", "customer"] as const).map((key) => (
              <button
                key={key}
                type="button"
                className="btn-ghost tap-target text-xs"
                disabled={submitting}
                onClick={() => {
                  setEmail(DEMO_ACCOUNTS[key].email);
                  setPassword(import.meta.env.VITE_DEMO_PASSWORD ?? "TipGuardDemo2026!");
                }}
              >
                {DEMO_ACCOUNTS[key].label}
              </button>
            ))}
          </div>
        </section>
      )}
    </AuthShell>
  );
}
