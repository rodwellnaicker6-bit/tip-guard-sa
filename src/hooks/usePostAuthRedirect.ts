import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { navigateAfterAuth, type PostAuthNavigateOptions } from "../lib/authRedirect";

/** Survives Login remount so a failed redirect does not re-trigger navigation loops. */
let postAuthRedirectUserId: string | null = null;

/** Cleared on sign-out so a later login can redirect again. */
export function resetPostAuthRedirectState(): void {
  postAuthRedirectUserId = null;
}

/**
 * Single post-login redirect coordinator for Login / Register.
 * Waits for `authReady` and passes profile snapshot to avoid duplicate Supabase reads.
 */
export function usePostAuthRedirect(options: PostAuthNavigateOptions & { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const { user, authReady, sessionReady, role, effectiveRole, profileFields, hasGuardRow, hasMerchantRow } =
    useAuth();
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
    if (!sessionReady) return;
    if (!user?.id) {
      redirectStarted.current = false;
      postAuthRedirectUserId = null;
      return;
    }
    if (redirectStarted.current || postAuthRedirectUserId === user.id) return;
    redirectStarted.current = true;
    postAuthRedirectUserId = user.id;
    setRouting(true);
    const snapshot = {
      role: effectiveRole ?? role,
      hasGuardRow,
      hasMerchantRow,
      profileFields,
    };
    void navigateAfterAuth(user.id, navigate, {
      from,
      preferOnboarding,
      snapshot,
    })
      .catch((e) => {
        console.error("[AuthCrash] usePostAuthRedirect failed", e);
        redirectStarted.current = false;
        postAuthRedirectUserId = null;
      })
      .finally(() => {
        if (mountedRef.current) setRouting(false);
      });
    // Snapshot captured once per redirect; profile fields must not retrigger navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- role/hasGuardRow/hasMerchantRow read at redirect start only
  }, [enabled, authReady, sessionReady, user?.id, navigate, from, preferOnboarding]);

  /** Emergency: never block login/register UI with a full-page loader. */
  const showLoader = false;
  return { routing, showLoader };
}
