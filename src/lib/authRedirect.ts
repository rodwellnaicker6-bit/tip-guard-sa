import type { NavigateFunction } from "react-router-dom";
import type { AuthRole } from "../context/authTypes";
import { isSupabaseBrowserConfigured, supabase } from "./supabase";
import { pathAfterSignIn } from "./postAuthRedirect";

export type PostAuthNavigateOptions = {
  from?: string;
  preferOnboarding?: boolean;
  snapshot?: {
    role: AuthRole;
    hasGuardRow: boolean;
    hasMerchantRow: boolean;
  };
};

function authNavigate(navigate: NavigateFunction, to: string, reason: string): void {
  if (import.meta.env.DEV) {
    console.info(`[AuthDebug] authRedirect navigate → ${to} (${reason})`);
  }
  navigate(to, { replace: true });
}

/** Post-login / post-callback routing — single source for Login, Register, AuthCallback. */
export async function navigateAfterAuth(
  userId: string,
  navigate: NavigateFunction,
  opts?: PostAuthNavigateOptions,
): Promise<void> {
  try {
    if (opts?.preferOnboarding) {
      authNavigate(navigate, "/onboarding", "preferOnboarding");
      return;
    }

    const stored =
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("tipguard_redirect") : null;
    if (stored?.startsWith("/") && !stored.startsWith("//")) {
      sessionStorage.removeItem("tipguard_redirect");
      authNavigate(navigate, stored, "stored redirect");
      return;
    }

    const from = opts?.from;
    const fromPath = from?.split("?")[0];
    const skipFrom =
      fromPath === "/login" ||
      fromPath === "/register" ||
      fromPath === "/forgot-password" ||
      fromPath === "/auth/callback";
    if (from?.startsWith("/") && !from.startsWith("//") && !skipFrom) {
      authNavigate(navigate, from, "location.state.from");
      return;
    }

    if (!isSupabaseBrowserConfigured) {
      authNavigate(navigate, "/", "supabase not configured");
      return;
    }

    if (opts?.snapshot) {
      const { role, hasGuardRow, hasMerchantRow } = opts.snapshot;
      authNavigate(
        navigate,
        pathAfterSignIn(role ?? undefined, hasGuardRow, hasMerchantRow),
        "auth snapshot",
      );
      return;
    }

    if (isSupabaseBrowserConfigured) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const { data: { session }, error: sessErr } = await supabase.auth.getSession();
      if (sessErr || !session?.user?.id) {
        if (userId) {
          if (import.meta.env.DEV) {
            console.warn(
              "[AuthDebug] navigateAfterAuth: getSession empty; using userId from auth context",
              sessErr?.message,
            );
          }
        } else {
          console.error("[AuthCrash] navigateAfterAuth: no session before redirect", sessErr?.message);
          authNavigate(navigate, "/login", "missing session");
          return;
        }
      } else {
        userId = session.user.id;
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const [{ data: profile, error: pErr }, { data: guard, error: gErr }, { data: merchant, error: mErr }] =
      await Promise.all([
        supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
        supabase.from("guards").select("id").eq("user_id", userId).maybeSingle(),
        supabase.from("merchants").select("id").eq("user_id", userId).maybeSingle(),
      ]);

    if (import.meta.env.DEV && (pErr || gErr || mErr)) {
      console.warn("[authRedirect] profile lookup", { pErr, gErr, mErr });
    }

    authNavigate(
      navigate,
      pathAfterSignIn(profile?.role as string | undefined, !!guard?.id, !!merchant?.id),
      "profile lookup",
    );
  } catch (e) {
    console.error("[AuthCrash] navigateAfterAuth", e);
    authNavigate(navigate, "/login", "unexpected error");
  }
}

export function clearAuthRedirectStorage(): void {
  try {
    sessionStorage.removeItem("tipguard_redirect");
  } catch {
    /* ignore */
  }
}
