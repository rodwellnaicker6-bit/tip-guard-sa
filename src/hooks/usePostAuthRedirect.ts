import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { navigateAfterAuth, type PostAuthNavigateOptions } from "../lib/authRedirect";

/**
 * Single post-login redirect coordinator for Login / Register.
 * Waits for `authReady` and passes profile snapshot to avoid duplicate Supabase reads.
 */
export function usePostAuthRedirect(options: PostAuthNavigateOptions & { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const { user, authReady, role, hasGuardRow, hasMerchantRow } = useAuth();
  const navigate = useNavigate();
  const [routing, setRouting] = useState(false);
  const mountedRef = useRef(true);
  const redirectStarted = useRef(false);
  const from = options.from;
  const preferOnboarding = options.preferOnboarding;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!authReady) return;
    if (!user?.id) {
      redirectStarted.current = false;
      return;
    }
    if (redirectStarted.current) return;
    redirectStarted.current = true;
    setRouting(true);
    void navigateAfterAuth(user.id, navigate, {
      from,
      preferOnboarding,
      snapshot: { role, hasGuardRow, hasMerchantRow },
    })
      .catch((e) => {
        console.error("[AuthCrash] usePostAuthRedirect failed", e);
        redirectStarted.current = false;
      })
      .finally(() => {
        if (mountedRef.current) setRouting(false);
      });
  }, [
    enabled,
    authReady,
    user?.id,
    navigate,
    from,
    preferOnboarding,
    role,
    hasGuardRow,
    hasMerchantRow,
  ]);

  const showLoader = Boolean(user?.id && (routing || !authReady));
  return { routing, showLoader };
}
