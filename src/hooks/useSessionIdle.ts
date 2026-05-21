import { useEffect, useRef } from "react";
import { useAuth } from "../context/useAuth";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;

/** Minutes until idle sign-out; 0 or unset disables. Set via VITE_SESSION_IDLE_MINUTES. */
function idleMsFromEnv(): number {
  const raw = import.meta.env.VITE_SESSION_IDLE_MINUTES?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n * 60 * 1000;
}

/**
 * Scaffold: signs out after prolonged inactivity when VITE_SESSION_IDLE_MINUTES is set.
 * Post-MVP: server-side session revocation + warning modal before logout.
 */
export function useSessionIdle() {
  const { user, signOut } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleMs = idleMsFromEnv();

  useEffect(() => {
    if (!user?.id || idleMs <= 0) return;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void signOut();
      }, idleMs);
    };

    reset();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, reset, { passive: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, reset);
      }
    };
  }, [user?.id, idleMs, signOut]);
}
