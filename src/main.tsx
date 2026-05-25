import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/fintech.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BUILD_ID } from "./lib/buildInfo";
import { bootLog, logBootHealth, logRuntimeEnvPresence } from "./lib/bootDebug";
import { validateClientEnv } from "./lib/env";
import { initAnalytics } from "./lib/analytics";
import { initSentry } from "./lib/sentry";

const BOOTSTRAP_FALLBACK_HTML = `
  <div style="font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:1.5rem;color:#e2e8f0;background:#020617;min-height:100vh">
    <h1 style="color:#fbbf24;font-size:1.25rem">TipGuard could not start</h1>
    <p style="color:#94a3b8;font-size:0.875rem">The app failed to mount. Check the browser console, then reload.</p>
    <button type="button" onclick="location.reload()" style="margin-top:1rem;padding:0.75rem 1rem;border-radius:1rem;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#e2e8f0;font-weight:600;cursor:pointer">Reload</button>
  </div>
`;

function applyThemeFromStorage(): void {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("tipguard_theme") === "hc") {
      document.documentElement.dataset.theme = "hc";
    }
    if (typeof localStorage !== "undefined") {
      if (localStorage.getItem("tipguard_dark") === "0") {
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.add("dark");
      }
    }
  } catch (e) {
    console.error("[TipGuard] theme bootstrap failed", e);
  }
}

function renderBootstrapFallback(rootEl: HTMLElement | null, err: unknown): void {
  console.error("[TipGuard] bootstrap failed", err);
  const html = BOOTSTRAP_FALLBACK_HTML;
  if (rootEl) {
    rootEl.innerHTML = html;
    return;
  }
  document.body.innerHTML = html;
}

function bootstrap(): void {
  try {
    console.log("PROD_BUILD_ACTIVE", BUILD_ID);
    console.log("SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL);
    bootLog("main.tsx bootstrap start", { buildId: BUILD_ID });
    logRuntimeEnvPresence();
    applyThemeFromStorage();
    const envCheck = validateClientEnv();
    if (!envCheck.ok) {
      bootLog("env check issues (rendering anyway)", envCheck.message, envCheck.missing);
    }
    try {
      initSentry();
    } catch (e) {
      console.error("[TipGuard] initSentry failed", e);
    }
    try {
      initAnalytics();
    } catch (e) {
      console.error("[TipGuard] initAnalytics failed", e);
    }

    const rootEl = document.getElementById("root");
    if (!rootEl) {
      renderBootstrapFallback(null, new Error("TipGuard: #root element missing in index.html"));
      return;
    }

    logBootHealth("bootstrap");
    bootLog("createRoot render");
    const root = createRoot(rootEl);
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  } catch (err) {
    renderBootstrapFallback(document.getElementById("root"), err);
  }
}

bootstrap();
