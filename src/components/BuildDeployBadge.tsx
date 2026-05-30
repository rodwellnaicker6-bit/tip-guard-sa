import { BUILD_ID } from "../lib/buildInfo";
import { isComplianceDemoMode } from "../lib/complianceDemo";

/** Subtle deploy fingerprint — confirms which Vite bundle is active. */
export function BuildDeployBadge() {
  if (isComplianceDemoMode()) return null;
  return (
    <div
      data-build-id={BUILD_ID}
      title={`TipGuard build ${BUILD_ID}`}
      className="pointer-events-none fixed bottom-1 right-1 z-[9999] font-mono text-[10px] text-slate-500/60 select-none"
      aria-hidden
    >
      build:{BUILD_ID}
    </div>
  );
}
