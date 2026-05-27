import { type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { logAuthKickout } from "../lib/authDebug";
import { useAuth } from "../context/useAuth";
import { useGracePeriod } from "../hooks/useGracePeriod";
import { TimedPageLoader } from "./TimedPageLoader";

const LOGIN_REDIRECT_GRACE_MS = 3_500;

function loginRedirectState(pathname: string, search: string) {
  return { from: `${pathname}${search}` };
}

function hasAuthenticatedSession(userId: string | undefined, sessionUserId: string | undefined): boolean {
  return Boolean(userId || sessionUserId);
}

/** Block protected routes until session is hydrated and profile rows are loaded when signed in. */
export function RequireAuth({ children }: { children: ReactElement }) {
  const { user, session, authReady, sessionReady } = useAuth();
  const location = useLocation();
  const sessionMissing =
    sessionReady && authReady && !hasAuthenticatedSession(user?.id, session?.user?.id);
  const graceElapsed = useGracePeriod(sessionMissing, LOGIN_REDIRECT_GRACE_MS);

  if (!sessionReady || !authReady) {
    return <TimedPageLoader label="Checking your session…" />;
  }

  if (!hasAuthenticatedSession(user?.id, session?.user?.id)) {
    if (!graceElapsed) {
      return <TimedPageLoader label="Restoring your session…" />;
    }
    logAuthKickout("no user after authReady", "RequireAuth", { path: location.pathname });
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  return children;
}

export function RequireAdmin({ children }: { children: ReactElement }) {
  const { user, session, role, effectiveRole, authReady, sessionReady } = useAuth();
  const location = useLocation();
  if (!sessionReady || !authReady) return <TimedPageLoader label="Checking admin session…" />;
  if (!hasAuthenticatedSession(user?.id, session?.user?.id)) {
    if (session?.user?.id && !user?.id) return <TimedPageLoader label="Restoring your session…" />;
    logAuthKickout("no user", "RequireAdmin", { path: location.pathname });
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  const adminRole = effectiveRole ?? role;
  if (adminRole !== "admin") {
    return <Navigate to="/" replace />;
  }
  return children;
}

/** Guard dashboard routes (not `/guard/setup`, where new guards land first). */
export function RequireGuard({ children }: { children: ReactElement }) {
  const { user, session, authReady, sessionReady, isGuardUser } = useAuth();
  const location = useLocation();
  if (!sessionReady || !authReady) return <TimedPageLoader label="Loading guard hub…" />;
  if (!hasAuthenticatedSession(user?.id, session?.user?.id)) {
    if (session?.user?.id && !user?.id) return <TimedPageLoader label="Restoring your session…" />;
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
  const { user, session, authReady, sessionReady, isMerchantUser } = useAuth();
  const location = useLocation();
  if (!sessionReady || !authReady) return <TimedPageLoader label="Loading venue hub…" />;
  if (!hasAuthenticatedSession(user?.id, session?.user?.id)) {
    if (session?.user?.id && !user?.id) return <TimedPageLoader label="Restoring your session…" />;
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
