/** Structured merchant QR hub load trace (production-safe). */

export type MerchantQrHubQueryTrace = {
  name: string;
  durationMs: number;
  ok: boolean;
  rowCount?: number;
  error?: string | null;
};

export type MerchantQrHubTrace = {
  userId: string;
  merchantId: string | null;
  buildId?: string;
  totalDurationMs: number;
  queries: MerchantQrHubQueryTrace[];
  outcome: "ok" | "timeout" | "error" | "cancelled";
};

export function logMerchantQrHubTrace(trace: MerchantQrHubTrace): void {
  if (typeof console === "undefined") return;
  console.info("[TipGuard:qr-hub-trace]", trace);
}
