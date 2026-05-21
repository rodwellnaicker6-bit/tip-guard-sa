import { useEffect, type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import PageLoader from "./PageLoader";

function loginRedirectState(pathname: string, search: string) {
  return { from: `${pathname}${search}` };
}

/** Block protected routes until session is hydrated and profile rows are loaded when signed in. */
export function RequireAuth({ children }: { children: ReactElement }) {
  const { user, authReady } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info(
      `[AuthDebug] RequireAuth ${location.pathname} authReady=${authReady} user=${user?.id ?? "none"}`,
    );
  }, [location.pathname, authReady, user?.id]);
  if (!authReady) return <PageLoader />;
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
  if (!authReady) return <PageLoader />;
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
  if (!authReady) return <PageLoader />;
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
  if (!authReady) return <PageLoader />;
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
