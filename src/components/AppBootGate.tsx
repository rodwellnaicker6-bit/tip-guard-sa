import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../context/useAuth";
import { didSupabaseInitFail, isSupabaseBrowserConfigured } from "../lib/supabase";
import { bootLog, logBootHealth } from "../lib/bootDebug";
import { BootBanner } from "./BootBanner";
import { BootLoadingFallback } from "./BootFallback";
import { OfflineBanner } from "./OfflineBanner";
import MaintenancePage from "../pages/MaintenancePage";

const FORCE_READY_MS = 10_000;

function isClientMaintenanceMode(): boolean {
  const v = import.meta.env.VITE_MAINTENANCE_MODE?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * First-paint gate: brief splash while auth hydrates; always unblocks within {@link FORCE_READY_MS}.
 * Never blocks the app on missing Paystack — checkout pages show "payments unavailable" instead.
 */
export function AppBootGate({ children }: { children: ReactNode }) {
  if (isClientMaintenanceMode()) {
    return <MaintenancePage />;
  }
  return <AppBootGateInner>{children}</AppBootGateInner>;
}

function AppBootGateInner({ children }: { children: ReactNode }) {
  const { authReady } = useAuth();
  const [forceReady, setForceReady] = useState(false);

  useEffect(() => {
    bootLog("AppBootGate mounted", {
      supabaseConfigured: isSupabaseBrowserConfigured,
      supabaseInitFailed: didSupabaseInitFail(),
    });
    const t = window.setTimeout(() => {
      bootLog("AppBootGate force ready", { authReady });
      setForceReady(true);
      logBootHealth("boot gate ready", { authReady });
    }, FORCE_READY_MS);
    return () => window.clearTimeout(t);
  }, [authReady]);

  useEffect(() => {
    if (authReady) logBootHealth("auth initialized");
  }, [authReady]);

  if (!authReady && !forceReady) {
    return <BootLoadingFallback />;
  }

  return (
    <div className="app-root">
      <BootBanner />
      <OfflineBanner />
      <div className="app-main">{children}</div>
    </div>
  );
}
