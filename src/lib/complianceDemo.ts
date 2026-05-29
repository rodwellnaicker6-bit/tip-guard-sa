/** Compliance demo polish: hide test banners and internal build fingerprints in production UI. */
export function isComplianceDemoMode(): boolean {
  const v = import.meta.env.VITE_COMPLIANCE_DEMO_MODE?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
