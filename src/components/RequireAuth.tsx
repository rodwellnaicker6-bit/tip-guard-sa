import { useEffect, useState, type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { logAuthKickout } from "../lib/authDebug";
import { useAuth } from "../context/useAuth";
import { TimedPageLoader } from "./TimedPageLoader";

const LOGIN_REDIRECT_GRACE_MS = 1_500;

function loginRedirectState(pathname: string, search: string) {
  return { from: `${pathname}${search}` };
}

/** Block protected routes until session is hydrated and profile rows are loaded when signed in. */
export function RequireAuth({ children }: { children: ReactElement }) {
  const { user, session, authReady } = useAuth();
  const location = useLocation();
  const [graceElapsed, setGraceElapsed] = useState(false);

  useEffect(() => {
    if (user?.id || !authReady) return undefined;
    const t = window.setTimeout(() => setGraceElapsed(true), LOGIN_REDIRECT_GRACE_MS);
    return () => {
      window.clearTimeout(t);
      setGraceElapsed(false);
    };
  }, [user?.id, authReady]);

  if (!authReady) return <TimedPageLoader label="Checking your session…" />;

  if (!user?.id) {
    if (session?.user?.id) {
      return <TimedPageLoader label="Restoring your session…" />;
    }
    if (!graceElapsed) {
      return <TimedPageLoader label="Checking your session…" />;
    }
    logAuthKickout("no user after authReady", "RequireAuth", { path: location.pathname });
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  return children;
}

export function RequireAdmin({ children }: { children: ReactElement }) {
  const { user, session, role, authReady } = useAuth();
  const location = useLocation();
  if (!authReady) return <TimedPageLoader label="Checking admin session…" />;
  if (!user?.id) {
    if (session?.user?.id) return <TimedPageLoader label="Restoring your session…" />;
    logAuthKickout("no user", "RequireAdmin", { path: location.pathname });
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
  const { user, session, authReady, isGuardUser } = useAuth();
  const location = useLocation();
  if (!authReady) return <TimedPageLoader label="Loading guard hub…" />;
  if (!user?.id) {
    if (session?.user?.id) return <TimedPageLoader label="Restoring your session…" />;
    logAuthKickout("no user", "RequireGuard", { path: location.pathname });
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
  const { user, session, authReady, isMerchantUser } = useAuth();
  const location = useLocation();
  if (!authReady) return <TimedPageLoader label="Loading venue hub…" />;
  if (!user?.id) {
    if (session?.user?.id) return <TimedPageLoader label="Restoring your session…" />;
    logAuthKickout("no user", "RequireMerchant", { path: location.pathname });
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  if (!isMerchantUser) {
    return <Navigate to="/merchant/setup" replace state={loginRedirectState(location.pathname, location.search)} />;
  }
  return children;
}
