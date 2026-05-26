import { type ReactNode } from "react";
import { OfflineBanner } from "./OfflineBanner";
import MaintenancePage from "../pages/MaintenancePage";

function isClientMaintenanceMode(): boolean {
  const v = import.meta.env.VITE_MAINTENANCE_MODE?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Emergency: never block first paint on auth hydration (boot banner/loader disabled). */
export function AppBootGate({ children }: { children: ReactNode }) {
  if (isClientMaintenanceMode()) {
    return <MaintenancePage />;
  }

  return (
    <div className="app-root">
      <OfflineBanner />
      <div className="app-main">{children}</div>
    </div>
  );
}
