/** Safe post-login return path from router state or `?redirect=` query. */
export function sanitizeAuthRedirectPath(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

/** Persist tip/checkout return URL for navigateAfterAuth (Login, QR pay). */
export function stashAuthRedirectPath(path: string | null | undefined): string | null {
  const safe = sanitizeAuthRedirectPath(path);
  if (!safe || typeof sessionStorage === "undefined") return safe;
  try {
    sessionStorage.setItem("tipguard_redirect", safe);
  } catch {
    /* ignore */
  }
  return safe;
}

export function readLoginRedirectTarget(
  search: string,
  stateFrom: string | null | undefined,
): string | null {
  const params = new URLSearchParams(search);
  const fromQuery = sanitizeAuthRedirectPath(params.get("redirect"));
  const fromState = sanitizeAuthRedirectPath(stateFrom);
  const target = fromQuery ?? fromState;
  if (target) stashAuthRedirectPath(target);
  return target;
}
