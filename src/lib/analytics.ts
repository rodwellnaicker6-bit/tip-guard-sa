/**
 * Lightweight analytics — Plausible (preferred) or PostHog. Env-gated; never throws.
 */

type PlausibleFn = (event: string, options?: { u?: string; props?: Record<string, string> }) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn;
    posthog?: { init: (key: string, opts: { api_host?: string }) => void; capture: (event: string, props?: Record<string, unknown>) => void };
  }
}

let analyticsMode: "none" | "plausible" | "posthog" = "none";

export function initAnalytics(): void {
  try {
    const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN?.trim();
    if (plausibleDomain) {
      const s = document.createElement("script");
      s.defer = true;
      s.dataset.domain = plausibleDomain;
      s.src = "https://plausible.io/js/script.js";
      s.onerror = () => {
        if (import.meta.env.DEV) console.warn("[TipGuard] Plausible script failed to load");
      };
      document.head.appendChild(s);
      analyticsMode = "plausible";
      return;
    }

    const posthogKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
    if (posthogKey) {
      const host = import.meta.env.VITE_POSTHOG_HOST?.trim() || "https://app.posthog.com";
      const s = document.createElement("script");
      s.async = true;
      s.src = `${host.replace(/\/$/, "")}/static/array.js`;
      s.onload = () => {
        try {
          window.posthog?.init(posthogKey, { api_host: host });
        } catch (e) {
          console.error("[TipGuard] PostHog init failed", e);
        }
      };
      s.onerror = () => {
        if (import.meta.env.DEV) console.warn("[TipGuard] PostHog script failed to load");
      };
      document.head.appendChild(s);
      analyticsMode = "posthog";
    }
  } catch (e) {
    console.error("[TipGuard] initAnalytics failed", e);
  }
}

export function trackPageview(path: string): void {
  try {
    if (analyticsMode === "plausible" && typeof window.plausible === "function") {
      const u = `${typeof window !== "undefined" ? window.location.origin : ""}${path}`;
      window.plausible("pageview", { u });
      return;
    }
    if (analyticsMode === "posthog" && window.posthog?.capture) {
      window.posthog.capture("$pageview", { $current_url: path });
    }
  } catch {
    /* never block navigation */
  }
}
