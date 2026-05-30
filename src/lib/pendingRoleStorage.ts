import type { AuthRole } from "../context/authTypes";

const KEY_PREFIX = "tipguard_pending_role_";

export function readPendingRole(userId: string | undefined): AuthRole {
  if (!userId || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${KEY_PREFIX}${userId}`);
    if (raw === "guard" || raw === "customer" || raw === "merchant" || raw === "admin") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writePendingRole(userId: string | undefined, role: AuthRole): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!userId || !role) {
      if (userId) sessionStorage.removeItem(`${KEY_PREFIX}${userId}`);
      return;
    }
    sessionStorage.setItem(`${KEY_PREFIX}${userId}`, role);
  } catch {
    /* ignore */
  }
}

export function clearPendingRole(userId?: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (userId) {
      sessionStorage.removeItem(`${KEY_PREFIX}${userId}`);
      return;
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(KEY_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
