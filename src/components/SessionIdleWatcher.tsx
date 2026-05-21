import { useSessionIdle } from "../hooks/useSessionIdle";

/** Mounted under AuthProvider to enable optional idle logout. */
export function SessionIdleWatcher() {
  useSessionIdle();
  return null;
}
