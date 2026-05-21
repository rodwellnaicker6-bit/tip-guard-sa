import type { NavigateFunction } from "react-router-dom";
import { isSupabaseBrowserConfigured, supabase } from "./supabase";
import { pathAfterSignIn } from "./postAuthRedirect";

/** Post-login / post-callback routing — single source for Login, Register, AuthCallback. */
export async function navigateAfterAuth(
  userId: string,
  navigate: NavigateFunction,
  opts?: { from?: string; preferOnboarding?: boolean },
): Promise<void> {
  const stored =
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem("tipguard_redirect") : null;
  if (stored?.startsWith("/") && !stored.startsWith("//")) {
    sessionStorage.removeItem("tipguard_redirect");
    navigate(stored, { replace: true });
    return;
  }
  const from = opts?.from;
  if (from?.startsWith("/") && !from.startsWith("//")) {
    navigate(from, { replace: true });
    return;
  }

  if (!isSupabaseBrowserConfigured) {
    navigate("/", { replace: true });
    return;
  }

  const [{ data: profile, error: pErr }, { data: guard, error: gErr }, { data: merchant, error: mErr }] =
    await Promise.all([
      supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
      supabase.from("guards").select("id").eq("user_id", userId).maybeSingle(),
      supabase.from("merchants").select("id").eq("user_id", userId).maybeSingle(),
    ]);

  if (import.meta.env.DEV && (pErr || gErr || mErr)) {
    console.warn("[authRedirect] profile lookup", { pErr, gErr, mErr });
  }

  if (opts?.preferOnboarding) {
    navigate("/onboarding", { replace: true });
    return;
  }

  navigate(
    pathAfterSignIn(profile?.role as string | undefined, !!guard?.id, !!merchant?.id),
    { replace: true },
  );
}

export function clearAuthRedirectStorage(): void {
  try {
    sessionStorage.removeItem("tipguard_redirect");
  } catch {
    /* ignore */
  }
}
