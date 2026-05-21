/** Local dev origins allowed in Supabase Auth redirect configuration. */
export const LOCAL_AUTH_ORIGINS = ["http://localhost:5173", "http://localhost:5174"] as const;

/** App origin for auth redirects (uses current browser port in dev). */
export function getAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return LOCAL_AUTH_ORIGINS[0];
}

export function getAuthCallbackUrl(): string {
  return `${getAppOrigin()}/auth/callback`;
}

export function getAuthResetUrl(): string {
  return `${getAppOrigin()}/auth/reset`;
}

/** All redirect URLs to register in Supabase Dashboard (both Vite ports). */
export function getSupabaseAuthRedirectAllowList(): string[] {
  const paths = ["/", "/auth/callback", "/auth/reset"] as const;
  const origins = new Set<string>([...LOCAL_AUTH_ORIGINS]);
  if (typeof window !== "undefined" && window.location?.origin) {
    origins.add(window.location.origin);
  }
  const out: string[] = [];
  for (const origin of origins) {
    for (const path of paths) {
      out.push(`${origin}${path}`);
    }
  }
  return [...new Set(out)];
}
