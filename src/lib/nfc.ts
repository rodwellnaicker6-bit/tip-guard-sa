/**
 * NFC ecosystem (Web NFC) — tap-to-tip, merchant cards, staff badges.
 * Limited to Chromium + HTTPS + user gesture. No RFID terminology.
 *
 * Security: tags may only supply a tip *token*; guard/merchant IDs are never
 * trusted from NDEF alone — callers must run `resolveTipTarget` before payment UI.
 */

import { recordError } from "./errorTelemetry";
import { stabilLog } from "./stabilLog";

export type NfcTagKind = "tap_to_tip" | "merchant_card" | "staff_badge" | "payment_confirm";

export type NfcPayload = {
  kind: NfcTagKind;
  /** Tip link or QR token resolved server-side */
  token?: string;
  guard_id?: string;
  merchant_id?: string;
};

export type NfcSupport = "unsupported" | "available" | "unknown";

/** Public tip tokens — alphanumeric, underscore, hyphen; 4–128 chars. */
export const TIP_TOKEN_RE = /^[a-zA-Z0-9_-]{4,128}$/;

const PRODUCTION_TIP_HOSTS = new Set(["tipguardsa.co.za", "www.tipguardsa.co.za"]);
const DEV_TIP_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Paths allowed on tip domain deep links (no Paystack / arbitrary URLs). */
const ALLOWED_TIP_PATH = /^\/(?:tip|nfc)\/([a-zA-Z0-9_-]+)\/?$/i;

const NFC_DEBOUNCE_MS = 2_500;
let lastNfcTapAt = 0;
let lastNfcTapToken: string | null = null;

export function allowedTipHosts(): Set<string> {
  const hosts = new Set(PRODUCTION_TIP_HOSTS);
  if (import.meta.env.DEV) {
    for (const h of DEV_TIP_HOSTS) hosts.add(h);
  }
  return hosts;
}

export function isValidTipToken(token: string): boolean {
  return TIP_TOKEN_RE.test(token.trim());
}

/** Normalize and validate a tip token from tag or URL; null if forged/invalid. */
export function sanitizeTipToken(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!isValidTipToken(t)) return null;
  return t;
}

function isBlockedScheme(scheme: string): boolean {
  const s = scheme.toLowerCase();
  return s === "javascript:" || s === "data:" || s === "vbscript:" || s === "file:";
}

/** Reject Paystack / third-party checkout URLs embedded on tags. */
export function isForbiddenPaymentUrl(href: string): boolean {
  const lower = href.trim().toLowerCase();
  if (lower.includes("paystack") || lower.includes("checkout.paystack")) return true;
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    try {
      const u = new URL(href.trim());
      if (isBlockedScheme(u.protocol)) return true;
      const host = u.hostname.toLowerCase();
      if (!allowedTipHosts().has(host)) return true;
      return !ALLOWED_TIP_PATH.test(u.pathname);
    } catch {
      return true;
    }
  }
  return false;
}

/** Extract token from https://tipguardsa.co.za/tip/{token} or /tip/{token}. */
export function extractTipTokenFromUrl(href: string): string | null {
  const t = href.trim();
  if (!t || isForbiddenPaymentUrl(t)) return null;

  const schemeMatch = /^tipguard:\/\/tip\/([a-zA-Z0-9_-]+)/i.exec(t);
  if (schemeMatch) return sanitizeTipToken(schemeMatch[1]);

  if (t.startsWith("/")) {
    const pathMatch = ALLOWED_TIP_PATH.exec(t.split("?")[0] ?? t);
    return pathMatch ? sanitizeTipToken(pathMatch[1]) : null;
  }

  try {
    const u = new URL(t);
    if (isBlockedScheme(u.protocol)) return null;
    if (!allowedTipHosts().has(u.hostname.toLowerCase())) return null;
    const pathMatch = ALLOWED_TIP_PATH.exec(u.pathname);
    return pathMatch ? sanitizeTipToken(pathMatch[1]) : null;
  } catch {
    return null;
  }
}

/** True if the same token was tapped within the debounce window. */
export function isDuplicateNfcTap(token: string): boolean {
  const now = Date.now();
  if (token === lastNfcTapToken && now - lastNfcTapAt < NFC_DEBOUNCE_MS) return true;
  return false;
}

export function markNfcTapProcessed(token: string): void {
  lastNfcTapAt = Date.now();
  lastNfcTapToken = token;
}

export function resetNfcTapDebounceForTests(): void {
  lastNfcTapAt = 0;
  lastNfcTapToken = null;
}

export function hasNdefReader(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as unknown as { NDEFReader?: unknown }).NDEFReader === "function";
}

export function getNfcSupport(): NfcSupport {
  if (typeof window === "undefined") return "unknown";
  return hasNdefReader() ? "available" : "unsupported";
}

/** iPhone Safari / desktop — open QR tip flow instead of crashing. */
export function fallbackToQR(navigate: (path: string) => void, token?: string): void {
  const safe = token ? sanitizeTipToken(token) : null;
  if (safe) navigate(`/tip/${encodeURIComponent(safe)}`);
  else navigate("/customer");
}

export function nfcKindLabel(kind: NfcTagKind): string {
  switch (kind) {
    case "merchant_card":
      return "Merchant NFC card";
    case "staff_badge":
      return "Staff NFC badge";
    case "payment_confirm":
      return "NFC payment confirm";
    default:
      return "NFC tap-to-tip";
  }
}

function payloadFromToken(token: string): NfcPayload {
  return { kind: "tap_to_tip", token };
}

/** Parse NDEF text: `tipguard://tip/{token}`, HTTPS deep link, `/tip/{token}`, or JSON (token only). */
export function parseNfcTipPayload(text: string): NfcPayload | null {
  const t = text.trim();
  if (!t) return null;

  if (isForbiddenPaymentUrl(t) && !/^tipguard:\/\//i.test(t)) {
    stabilLog("nfc", "parse rejected forbidden URL", { len: t.length });
    return null;
  }

  const fromUrl = extractTipTokenFromUrl(t);
  if (fromUrl) return payloadFromToken(fromUrl);

  try {
    const j = JSON.parse(t) as NfcPayload;
    if (j?.kind && ["tap_to_tip", "merchant_card", "staff_badge", "payment_confirm"].includes(j.kind)) {
      if (j.kind === "tap_to_tip") {
        const safe = j.token ? sanitizeTipToken(j.token) : null;
        if (safe) return { kind: "tap_to_tip", token: safe };
        stabilLog("nfc", "parse rejected JSON tap_to_tip token", { kind: j.kind });
        return null;
      }
      stabilLog("nfc", "parse rejected non-tip JSON kind (use token deep link)", { kind: j.kind });
      return null;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

export type NfcReadOutcome = "ok" | "invalid_payload" | "duplicate" | "forbidden_url";

export async function prepareNfcTap(
  onRead?: (payload: NfcPayload, outcome: NfcReadOutcome) => void,
): Promise<{ ok: boolean; message: string }> {
  if (!hasNdefReader()) {
    stabilLog("nfc", "prepareNfcTap unsupported (no NDEFReader)");
    return {
      ok: false,
      message: "NFC is not supported here — use your QR code (works on iPhone and Android).",
    };
  }
  try {
    stabilLog("nfc", "prepareNfcTap scan start");
    const Reader = (
      window as unknown as {
        NDEFReader: new () => {
          scan: () => Promise<void>;
          addEventListener: (ev: string, fn: (e: { message?: { records?: { recordType: string; data: DataView }[] } }) => void) => void;
        };
      }
    ).NDEFReader;
    const reader = new Reader();
    reader.addEventListener("reading", (event) => {
      const rec = event.message?.records?.[0];
      if (rec?.recordType !== "text" || !rec.data) {
        stabilLog("nfc", "NFC read unsupported record type");
        recordError("nfc_read", "unsupported NDEF record", { code: "nfc_record" });
        onRead?.({ kind: "tap_to_tip" }, "invalid_payload");
        return;
      }
      const decoded = new TextDecoder().decode(rec.data);
      if (isForbiddenPaymentUrl(decoded) && !/^tipguard:\/\//i.test(decoded.trim())) {
        stabilLog("nfc", "NFC read rejected forbidden URL");
        recordError("nfc_read", "forbidden URL on tag", { code: "nfc_forbidden_url" });
        onRead?.({ kind: "tap_to_tip" }, "forbidden_url");
        return;
      }
      const payload = parseNfcTipPayload(decoded);
      if (!payload?.token) {
        stabilLog("nfc", "NFC read invalid payload", { len: decoded.length });
        recordError("nfc_read", "invalid tag payload", { code: "nfc_invalid_payload" });
        onRead?.({ kind: "tap_to_tip" }, "invalid_payload");
        return;
      }
      if (isDuplicateNfcTap(payload.token)) {
        stabilLog("nfc", "NFC duplicate tap ignored", { tokenLen: payload.token.length });
        onRead?.(payload, "duplicate");
        return;
      }
      markNfcTapProcessed(payload.token);
      stabilLog("nfc", "NFC read ok", { tokenLen: payload.token.length });
      onRead?.(payload, "ok");
    });
    await reader.scan();
    stabilLog("nfc", "prepareNfcTap scan listening");
    return { ok: true, message: "Hold your phone near the NFC tag…" };
  } catch (e) {
    const message = (e as Error).message ?? "NFC unavailable";
    stabilLog("nfc", "prepareNfcTap scan failed", { message });
    recordError("nfc_scan", message, { code: "nfc_prepare" });
    return { ok: false, message };
  }
}
