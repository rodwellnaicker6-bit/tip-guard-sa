import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { navigateAfterAuth } from "../lib/authRedirect";
import PageLoader from "../components/PageLoader";
import { AuthShell } from "../components/AuthShell";
import { DEMO_ACCOUNTS, isDemoMode } from "../lib/demoMode";

export default function Login() {
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const passwordUpdated = Boolean((location.state as { passwordUpdated?: boolean } | null)?.passwordUpdated);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [routing, setRouting] = useState(false);
  const redirectStarted = useRef(false);

  useEffect(() => {
    if (authLoading || !user?.id) {
      redirectStarted.current = false;
      setRouting(false);
      return;
    }
    if (redirectStarted.current) return;
    redirectStarted.current = true;
    setRouting(true);
    let cancelled = false;
    const from = (location.state as { from?: string } | null)?.from;
    void navigateAfterAuth(user.id, navigate, { from }).finally(() => {
      if (!cancelled) setRouting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, navigate, location.state]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email, password);
    setSubmitting(false);
    if (err) setError(err);
  }

  if (user?.id && routing) {
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
          className="field"
          type="email"
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={submitting}
        />
        <input
          className="field"
          type="password"
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
