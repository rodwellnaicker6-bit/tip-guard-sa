import { useEffect, useState, type ReactElement } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import PageLoader from "./PageLoader";

const ROUTE_AUTH_TIMEOUT_MS = 12_000;

function loginRedirectState(pathname: string, search: string) {
  return { from: `${pathname}${search}` };
}

function AuthRoutePending() {
  const { authBootError } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), ROUTE_AUTH_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!timedOut && !authBootError) return <PageLoader />;

  return (
    <div className="shell stack" role="alert">
      <h2>Still checking your session</h2>
      <p className="muted-label">
        TipGuard could not finish authentication setup. This is usually a network, Supabase, or redirect
        configuration issue.
      </p>
      {authBootError ? <div className="error">{authBootError}</div> : null}
      <button type="button" className="btn-gold tap-target" onClick={() => window.location.reload()}>
        Reload
      </button>
      <Link className="btn-ghost tap-target" style={{ textAlign: "center", textDecoration: "none" }} to="/login">
        Go to sign in
      </Link>
    </div>
  );
}

/** Block protected routes until session is hydrated and profile rows are loaded when signed in. */
export function RequireAuth({ children }: { children: ReactElement }) {
  const { user, authReady } = useAuth();
  const location = useLocation();
  if (!authReady) return <AuthRoutePending />;
  if (!user?.id) {
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  return children;
}

export function RequireAdmin({ children }: { children: ReactElement }) {
  const { user, role, authReady } = useAuth();
  const location = useLocation();
  if (!authReady) return <AuthRoutePending />;
  if (!user?.id) {
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  if (role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return children;
}

/** Guard dashboard routes (not `/guard/setup`, where new guards land first). */
export function RequireGuard({ children }: { children: ReactElement }) {
  const { user, authReady, isGuardUser } = useAuth();
  const location = useLocation();
  if (!authReady) return <AuthRoutePending />;
  if (!user?.id) {
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  if (!isGuardUser) {
    return <Navigate to="/onboarding" replace state={loginRedirectState(location.pathname, location.search)} />;
  }
  return children;
}

/** Merchant / venue hub (profile role `merchant` and/or a row in `merchants`). */
export function RequireMerchant({ children }: { children: ReactElement }) {
  const { user, authReady, isMerchantUser } = useAuth();
  const location = useLocation();
  if (!authReady) return <AuthRoutePending />;
  if (!user?.id) {
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  if (!isMerchantUser) {
    return <Navigate to="/merchant/setup" replace state={loginRedirectState(location.pathname, location.search)} />;
  }
  return children;
}
