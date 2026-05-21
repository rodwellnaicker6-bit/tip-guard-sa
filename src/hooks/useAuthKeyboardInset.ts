import { useEffect, useState } from "react";

/**
 * Estimates on-screen keyboard height via Visual Viewport API (iOS/Android).
 * Returns bottom inset in px — use as padding-bottom on auth shells.
 */
export function useAuthKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(gap > 72 ? Math.round(gap) : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
