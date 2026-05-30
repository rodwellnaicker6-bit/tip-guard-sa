import { useEffect, useRef, useState } from "react";

/** Fires when a blocking UI state exceeds this threshold (hint / recovery). */
export const UI_WATCHDOG_MS = 2_000;

/**
 * Returns true once `active` has been true longer than UI_WATCHDOG_MS.
 * Use for loading overlays: show "Still loading…" without freezing the shell.
 */
export function useUiWatchdog(active: boolean): boolean {
  const [slow, setSlow] = useState(false);
  const genRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setSlow(false);
    });
    const gen = ++genRef.current;
    const id = window.setTimeout(() => {
      if (gen === genRef.current) setSlow(true);
    }, UI_WATCHDOG_MS);
    return () => {
      cancelled = true;
      genRef.current += 1;
      window.clearTimeout(id);
    };
  }, [active]);

  return active && slow;
}
