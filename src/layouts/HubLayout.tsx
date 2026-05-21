import { Outlet } from "react-router-dom";
import { MobileBottomNav, type HubVariant } from "../components/MobileBottomNav";

export function HubLayout({ variant }: { variant: HubVariant }) {
  return (
    <div className="hub-shell">
      <Outlet />
      <MobileBottomNav variant={variant} />
    </div>
  );
}
