import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { usePostAuthRedirect } from "../hooks/usePostAuthRedirect";
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

const AUTH_CALLBACK_TIMEOUT_MS = 12_000;

export default function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState(() =>
    readAuthType() === "signup" ? "Confirming your email…" : "Signing you in…",
  );
  const [status, setStatus] = useState<Status>("working");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [sessionEstablished, setSessionEstablished] = useState(false);
  const mountedRef = useRef(true);
  const exchangeStarted = useRef(false);
  const authType = readAuthType();
  const preferOnboarding = authType === "signup";

  usePostAuthRedirect({ preferOnboarding, enabled: sessionEstablished });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (sessionEstablished || status === "error") return;
    const t = window.setTimeout(() => {
      if (!mountedRef.current || sessionEstablished) return;
      console.warn("[TipGuard] AuthCallback timeout — redirecting to login");
      navigate("/login", { replace: true, state: { from: "/" } });
    }, AUTH_CALLBACK_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [sessionEstablished, status, navigate]);

  useEffect(() => {
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    let cancelled = false;
    (async () => {
      if (!mountedRef.current) return;
      setStatus("working");
      setErrorDetail(null);
      try {
        let session: Session | null = null;

        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          const code = url.searchParams.get("code");
          if (code) {
            const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
            if (cancelled || !mountedRef.current) return;
            if (exErr) {
              console.error("[AuthCrash] AuthCallback.exchangeCodeForSession", exErr);
              setErrorDetail(formatAuthUserFacingError(exErr));
              setStatus("error");
              exchangeStarted.current = false;
              return;
            }
            session = data.session;
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          }
        }

        if (!session && typeof window !== "undefined") {
          const hash = window.location.hash;
          const params = new URLSearchParams(hash.replace(/^#/, ""));
          const access = params.get("access_token");
          const refresh = params.get("refresh_token");
          if (access && refresh) {
            const { data, error } = await supabase.auth.setSession({
              access_token: access,
              refresh_token: refresh,
            });
            if (cancelled || !mountedRef.current) return;
            if (error) {
              console.error("[AuthCrash] AuthCallback.setSession", error);
              setErrorDetail(formatAuthUserFacingError(error));
              setStatus("error");
              exchangeStarted.current = false;
              return;
            }
            session = data.session;
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          }
        }

        if (!session?.user?.id) {
          setErrorDetail("No active session after this link. Try signing in, or request a new email.");
          setStatus("error");
          exchangeStarted.current = false;
          return;
        }
        if (authType === "signup" && mountedRef.current) {
          setMessage("Email verified — you are signed in.");
        }
        if (mountedRef.current) {
          setSessionEstablished(true);
        }
      } catch (e) {
        if (!cancelled && mountedRef.current) {
          console.error("[AuthCrash] AuthCallback", e);
          setErrorDetail(formatAuthUserFacingError(e));
          setStatus("error");
          exchangeStarted.current = false;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authType]);

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
