import { memo } from "react";
import { GlassPanel } from "../fintech/GlassPanel";

type Props = {
  label: string;
  value: string;
  glow?: "amber" | "emerald" | "none";
  valueClassName?: string;
};

export const DashboardStatTile = memo(function DashboardStatTile({
  label,
  value,
  glow = "amber",
  valueClassName = "text-2xl font-black text-white",
}: Props) {
  return (
    <GlassPanel glow={glow === "none" ? undefined : glow} className="fx-fade-up min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 ${valueClassName}`}>{value}</p>
    </GlassPanel>
  );
});
