import { type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import PageLoader from "./PageLoader";

function loginRedirectState(pathname: string, search: string) {
  return { from: `${pathname}${search}` };
}

export function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user?.id) {
    return (
      <Navigate to="/login" replace state={loginRedirectState(location.pathname, location.search)} />
    );
  }
  return children;
}

export function RequireAdmin({ children }: { children: ReactElement }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
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
  const { user, loading, isGuardUser } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
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
  const { user, loading, isMerchantUser } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
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
