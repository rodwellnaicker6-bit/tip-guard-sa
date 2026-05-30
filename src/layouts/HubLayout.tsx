import { useEffect } from "react";
import { useOutlet } from "react-router-dom";
import { HubSafePlaceholder } from "../components/HubSafePlaceholder";
import { MobileBottomNav, type HubVariant } from "../components/MobileBottomNav";
import { EmergencyErrorBoundary } from "../lib/emergencySafeMode";
import { stabilLog } from "../lib/stabilLog";

export function HubLayout({ variant }: { variant: HubVariant }) {
  const outlet = useOutlet();

  useEffect(() => {
    stabilLog("hub", "dashboard shell ready", { variant });
  }, [variant]);

  return (
    <div className="hub-shell min-h-[100dvh]">
      <EmergencyErrorBoundary>
        {outlet ?? <HubSafePlaceholder title={`${variant} hub`} />}
      </EmergencyErrorBoundary>
      <MobileBottomNav variant={variant} />
    </div>
  );
}
