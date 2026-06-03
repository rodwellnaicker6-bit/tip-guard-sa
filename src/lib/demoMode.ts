/** Staging demo helpers — enable with VITE_DEMO_MODE=true (never on production builds). */

export const isDemoMode =
  !import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === "true";

export const DEMO_ACCOUNTS = {
  admin: { email: "demo-admin@tipguard.staging", label: "Admin demo" },
  merchant: { email: "demo-merchant@tipguard.staging", label: "Merchant demo" },
  guard: { email: "demo-guard@tipguard.staging", label: "Guard demo" },
  customer: { email: "demo-customer@tipguard.staging", label: "Customer demo" },
} as const;

export const DEMO_QR_TOKEN = "demo-staging-qr-01";

export function demoPaymentAnalytics() {
  return {
    tips_succeeded: 1842,
    tips_pending: 12,
    tips_failed: 7,
    volume_cents_succeeded: 284_650_00,
    transactions_succeeded: 1901,
    transactions_failed: 7,
    revenue_today_cents: 45_200_00,
    revenue_week_cents: 312_800_00,
    qr_scans_total: 12_480,
    top_guards: [
      { name: "Nomsa Demo", tip_count: 420, volume_cents: 84_000_00 },
      { name: "Sipho Dlamini", tip_count: 178, volume_cents: 28_405_00 },
      { name: "Thabo Nkosi", tip_count: 92, volume_cents: 9_800_00 },
    ],
    merchant_volume: [
      { name: "TipGuard Demo Venue", tip_count: 520, volume_cents: 104_000_00 },
      { name: "Waterfront Security Co", tip_count: 210, volume_cents: 42_000_00 },
    ],
    daily_revenue: Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return {
        day: d.toISOString().slice(0, 10),
        volume_cents: 15_000_00 + i * 2_500_00,
        tip_count: 40 + i * 3,
      };
    }),
  };
}
