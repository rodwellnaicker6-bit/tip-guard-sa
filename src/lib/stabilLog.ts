import { devInfo } from "./prodLog";

/** Production-safe one-line diagnostics (auth, payment, QR, NFC, dashboards). */
export function stabilLog(
  area: "auth" | "pay" | "qr" | "qr-auth" | "nfc" | "hub" | "boot",
  message: string,
  extra?: Record<string, unknown>,
): void {
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  devInfo(`[TipGuard:${area}] ${message}${suffix}`);
}
