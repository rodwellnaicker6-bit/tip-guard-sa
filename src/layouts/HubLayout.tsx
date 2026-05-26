import { Outlet } from "react-router-dom";
import { MobileBottomNav, type HubVariant } from "../components/MobileBottomNav";
import { EmergencyErrorBoundary } from "../lib/emergencySafeMode";

export function HubLayout({ variant }: { variant: HubVariant }) {
  return (
    <div className="hub-shell">
      <EmergencyErrorBoundary>
        <Outlet />
      </EmergencyErrorBoundary>
      <MobileBottomNav variant={variant} />
    </div>
  );
}
