/** Structured QR resolve trace for production debugging (no secrets). */

export type QrResolveTrace = {
  qrValue: string;
  venueId: string | null;
  locationId: string | null;
  guardId: string | null;
  eventId: string | null;
  supabaseQuery: string;
  queryDurationMs: number;
  queryResponse: {
    rpcOk: boolean;
    rowCount: number;
    reason?: string;
    rpcErrorCode?: string;
  };
};

export function logQrResolveTrace(trace: QrResolveTrace): void {
  if (typeof console === "undefined") return;
  console.info("[TipGuard:qr-trace]", trace);
}

/** Non-blocking analytics touch — event key shape matches DB session claim prefix. */
export function qrAnalyticsEventId(qrValue: string): string {
  const prefix = qrValue.slice(0, 32);
  return `qr_scan:${prefix}:${Date.now()}`;
}
