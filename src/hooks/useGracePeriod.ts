import { useEffect, useState } from "react";

/** True after `ms` while `active` remains true; resets when `active` becomes false. */
export function useGracePeriod(active: boolean, ms: number): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const t = window.setTimeout(() => setReady(true), ms);
    return () => {
      window.clearTimeout(t);
      setReady(false);
    };
  }, [active, ms]);
  return active && ready;
}
