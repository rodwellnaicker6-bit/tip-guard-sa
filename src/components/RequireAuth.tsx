import { type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { logAuthKickout } from "../lib/authDebug";
import { pathAfterSignIn } from "../lib/postAuthRedirect";
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

/** Block until session is hydrated. Profile/role loads do not block (pages show skeletons). */
export function RequireAuth({ children }: { children: ReactElement }) {
  const { user, session, sessionReady } = useAuth();
  const location = useLocation();
  const sessionMissing = sessionReady && !hasAuthenticatedSession(user?.id, session?.user?.id);
  const graceElapsed = useGracePeriod(sessionMissing, LOGIN_REDIRECT_GRACE_MS);

  if (!sessionReady) {
    return <TimedPageLoader label="Checking your session…" />;
  }

  if (!hasAuthenticatedSession(user?.id, session?.user?.id)) {
    if (!graceElapsed) {
      return <TimedPageLoader label="Restoring your session…" />;
    }
    logAuthKickout("no session after grace", "RequireAuth", { path: location.pathname });
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  return children;
}

export function RequireAdmin({ children }: { children: ReactElement }) {
  const { user, session, role, effectiveRole, profileFields, hasGuardRow, hasMerchantRow, authReady, sessionReady } =
    useAuth();
  const location = useLocation();
  if (!sessionReady) return <TimedPageLoader label="Checking admin session…" />;
  if (!hasAuthenticatedSession(user?.id, session?.user?.id)) {
    if (session?.user?.id && !user?.id) return <TimedPageLoader label="Restoring your session…" />;
    logAuthKickout("no user", "RequireAdmin", { path: location.pathname });
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  if (!authReady) return <TimedPageLoader label="Loading your account…" />;
  const adminRole = effectiveRole ?? role;
  if (adminRole !== "admin") {
    const dest = pathAfterSignIn(adminRole, hasGuardRow, hasMerchantRow, profileFields);
    return <Navigate to={dest} replace />;
  }
  return children;
}

/** Guard dashboard routes (not `/guard/setup`, where new guards land first). */
export function RequireGuard({ children }: { children: ReactElement }) {
  const { user, session, authReady, sessionReady, isGuardUser, hasGuardRow, role, effectiveRole } =
    useAuth();
  const location = useLocation();
  const sessionMissing = sessionReady && !hasAuthenticatedSession(user?.id, session?.user?.id);
  const graceElapsed = useGracePeriod(sessionMissing, LOGIN_REDIRECT_GRACE_MS);
  const guardAccessPending = authReady && !isGuardUser;
  const guardAccessGraceElapsed = useGracePeriod(guardAccessPending, LOGIN_REDIRECT_GRACE_MS);
  if (!sessionReady) return <TimedPageLoader label="Loading guard hub…" />;
  if (!hasAuthenticatedSession(user?.id, session?.user?.id)) {
    if (session?.user?.id && !user?.id) return <TimedPageLoader label="Restoring your session…" />;
    if (!graceElapsed) return <TimedPageLoader label="Restoring your session…" />;
    logAuthKickout("no user", "RequireGuard", { path: location.pathname });
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  if (!authReady) return <TimedPageLoader label="Loading your account…" />;
  const guardRoleHint = effectiveRole === "guard" || role === "guard";
  if (!isGuardUser && !hasGuardRow && guardRoleHint) {
    return <TimedPageLoader label="Loading your guard profile…" />;
  }
  if (!isGuardUser) {
    if (!guardAccessGraceElapsed) {
      return <TimedPageLoader label="Loading your guard profile…" />;
    }
    return <Navigate to="/onboarding" replace state={loginRedirectState(location.pathname, location.search)} />;
  }
  return children;
}

/** Merchant / venue hub (profile role `merchant` and/or a row in `merchants`). */
export function RequireMerchant({ children }: { children: ReactElement }) {
  const { user, session, authReady, sessionReady, isMerchantUser } = useAuth();
  const location = useLocation();
  if (!sessionReady) return <TimedPageLoader label="Loading venue hub…" />;
  if (!hasAuthenticatedSession(user?.id, session?.user?.id)) {
    if (session?.user?.id && !user?.id) return <TimedPageLoader label="Restoring your session…" />;
    logAuthKickout("no user", "RequireMerchant", { path: location.pathname });
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  if (!authReady) return <TimedPageLoader label="Loading your account…" />;
  if (!isMerchantUser) {
    return <Navigate to="/merchant/setup" replace state={loginRedirectState(location.pathname, location.search)} />;
  }
  return children;
}
