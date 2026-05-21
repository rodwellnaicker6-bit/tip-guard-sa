import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { navigateAfterAuth } from "../lib/authRedirect";
import { formatAuthUserFacingError } from "../lib/supabaseAuthErrors";

function readAuthType(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("type");
  if (fromQuery) return fromQuery;
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  return hashParams.get("type");
}

type Status = "working" | "error";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState(() =>
    readAuthType() === "signup" ? "Confirming your email…" : "Signing you in…",
  );
  const [status, setStatus] = useState<Status>("working");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("working");
      setErrorDetail(null);
      try {
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          const code = url.searchParams.get("code");
          if (code) {
            const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
            if (cancelled) return;
            if (exErr) {
              setErrorDetail(formatAuthUserFacingError(exErr));
              setStatus("error");
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
          const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
          if (cancelled) return;
          if (error) {
            setErrorDetail(formatAuthUserFacingError(error));
            setStatus("error");
            return;
          }
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }

        const authType = readAuthType();
        const { data, error: sessErr } = await supabase.auth.getSession();
        if (cancelled) return;
        if (sessErr) {
          setErrorDetail(formatAuthUserFacingError(sessErr));
          setStatus("error");
          return;
        }
        if (!data.session) {
          setErrorDetail("No active session after this link. Try signing in, or request a new email.");
          setStatus("error");
          return;
        }
        if (authType === "signup") {
          setMessage("Email verified — you are signed in.");
        }
        await navigateAfterAuth(data.session.user.id, navigate, {
          preferOnboarding: authType === "signup",
        });
      } catch (e) {
        if (!cancelled) {
          setErrorDetail(formatAuthUserFacingError(e));
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (status === "error") {
    return (
      <div className="shell stack">
        <h2>Auth</h2>
        <div className="error">{errorDetail ?? "Could not complete sign-in."}</div>
        <Link className="btn-gold" style={{ textAlign: "center", textDecoration: "none" }} to="/login">
          Back to sign in
        </Link>
        <Link to="/register">Create account</Link>
      </div>
    );
  }

  return (
    <div className="shell stack">
      <h2>Auth</h2>
      <p>{message}</p>
      <p className="muted-label" role="status" aria-busy="true">
        Please wait…
      </p>
    </div>
  );
}
