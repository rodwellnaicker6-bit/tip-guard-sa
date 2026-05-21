import type { NavigateFunction } from "react-router-dom";
import type { AuthProfileFields, AuthRole } from "../context/authTypes";
import { isSupabaseBrowserConfigured, supabase } from "./supabase";
import { pathAfterSignIn } from "./postAuthRedirect";

export type PostAuthNavigateOptions = {
  from?: string;
  preferOnboarding?: boolean;
  snapshot?: {
    role: AuthRole;
    hasGuardRow: boolean;
    hasMerchantRow: boolean;
    profileFields?: AuthProfileFields;
  };
};

function authNavigate(navigate: NavigateFunction, to: string): void {
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
      authNavigate(navigate, "/onboarding");
      return;
    }

    const stored =
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem("tipguard_redirect") : null;
    if (stored?.startsWith("/") && !stored.startsWith("//")) {
      sessionStorage.removeItem("tipguard_redirect");
      authNavigate(navigate, stored);
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
      authNavigate(navigate, from);
      return;
    }

    if (!isSupabaseBrowserConfigured) {
      authNavigate(navigate, "/");
      return;
    }

    if (opts?.snapshot) {
      const { role, hasGuardRow, hasMerchantRow, profileFields } = opts.snapshot;
      authNavigate(
        navigate,
        pathAfterSignIn(role ?? undefined, hasGuardRow, hasMerchantRow, profileFields),
      );
      return;
    }

    if (isSupabaseBrowserConfigured) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const { data: { session }, error: sessErr } = await supabase.auth.getSession();
      if (sessErr || !session?.user?.id) {
        if (!userId) {
          console.error("[AuthCrash] navigateAfterAuth: no session before redirect", sessErr?.message);
          authNavigate(navigate, "/login");
          return;
        }
      } else {
        userId = session.user.id;
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const [{ data: profile, error: pErr }, { data: guard, error: gErr }, { data: merchant, error: mErr }] =
      await Promise.all([
        supabase.from("profiles").select("role, full_name, phone").eq("id", userId).maybeSingle(),
        supabase.from("guards").select("id").eq("user_id", userId).maybeSingle(),
        supabase.from("merchants").select("id").eq("user_id", userId).maybeSingle(),
      ]);

    if (import.meta.env.DEV && (pErr || gErr || mErr)) {
      console.warn("[authRedirect] profile lookup", { pErr, gErr, mErr });
    }

    authNavigate(
      navigate,
      pathAfterSignIn(
        profile?.role as string | undefined,
        !!guard?.id,
        !!merchant?.id,
        profile
          ? {
              full_name: (profile.full_name as string | null) ?? null,
              phone: (profile.phone as string | null) ?? null,
            }
          : null,
      ),
    );
  } catch (e) {
    console.error("[AuthCrash] navigateAfterAuth", e);
    authNavigate(navigate, "/login");
  }
}

export function clearAuthRedirectStorage(): void {
  try {
    sessionStorage.removeItem("tipguard_redirect");
  } catch {
    /* ignore */
  }
}
