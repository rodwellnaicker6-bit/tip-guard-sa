import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { supabase } from "../lib/supabase";
import { formatAuthUserFacingError } from "../lib/supabaseAuthErrors";
import PageLoader from "../components/PageLoader";

type Phase = "loading" | "ready" | "invalid";

export default function PasswordReset() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase("loading");
      setLinkError(null);
      try {
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          const code = url.searchParams.get("code");
          if (code) {
            const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
            if (exErr) {
              if (!cancelled) {
                setLinkError(formatAuthUserFacingError(exErr));
                setPhase("invalid");
              }
              return;
            }
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          }
        }
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const access = params.get("access_token");
        const refresh = params.get("refresh_token");
        if (access && refresh) {
          const { error: hashErr } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
          if (hashErr) {
            if (!cancelled) {
              setLinkError(formatAuthUserFacingError(hashErr));
              setPhase("invalid");
            }
            return;
          }
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }
        const { data, error: sessErr } = await supabase.auth.getSession();
        if (cancelled) return;
        if (sessErr) {
          setLinkError(formatAuthUserFacingError(sessErr));
          setPhase("invalid");
          return;
        }
        if (!data.session) {
          setLinkError("This reset link is invalid or has expired. Request a new link from the sign-in page.");
          setPhase("invalid");
          return;
        }
        setPhase("ready");
      } catch (e) {
        if (!cancelled) {
          setLinkError(formatAuthUserFacingError(e));
          setPhase("invalid");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Use at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { error: err } = await updatePassword(password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    navigate("/login", { replace: true, state: { passwordUpdated: true } });
  }

  if (phase === "loading") {
    return (
      <div className="shell stack">
        <h2>New password</h2>
        <PageLoader />
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="shell stack">
        <h2>Reset link problem</h2>
        <div className="error">{linkError ?? "We could not open a recovery session from this link."}</div>
        <Link className="btn-gold" style={{ textAlign: "center", textDecoration: "none" }} to="/forgot-password">
          Request a new link
        </Link>
        <Link to="/login">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="shell stack">
      <h2>Choose a new password</h2>
      <form className="stack mt" onSubmit={onSubmit}>
        <input
          className="field"
          type="password"
          autoComplete="new-password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          disabled={submitting}
        />
        <input
          className="field"
          type="password"
          autoComplete="new-password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={6}
          required
          disabled={submitting}
        />
        {error && <div className="error">{error}</div>}
        <button className="btn-gold" type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
      <Link to="/login">Sign in</Link>
    </div>
  );
}
