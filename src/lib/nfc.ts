/**
 * NFC ecosystem (Web NFC) — tap-to-tip, merchant cards, staff badges.
 * Limited to Chromium + HTTPS + user gesture. No RFID terminology.
 */

export type NfcTagKind = "tap_to_tip" | "merchant_card" | "staff_badge" | "payment_confirm";

export type NfcPayload = {
  kind: NfcTagKind;
  /** Tip link or QR token resolved server-side */
  token?: string;
  guard_id?: string;
  merchant_id?: string;
};

export type NfcSupport = "unsupported" | "available" | "unknown";

export function getNfcSupport(): NfcSupport {
  if (typeof window === "undefined") return "unknown";
  const n = (window as unknown as { NDEFReader?: unknown }).NDEFReader;
  return typeof n === "function" ? "available" : "unsupported";
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

/** Parse NDEF text record `tipguard://tip/{token}` or JSON payload. */
export function parseNfcTipPayload(text: string): NfcPayload | null {
  const t = text.trim();
  const urlMatch = /^tipguard:\/\/tip\/([a-zA-Z0-9_-]+)/i.exec(t);
  if (urlMatch) return { kind: "tap_to_tip", token: urlMatch[1] };
  try {
    const j = JSON.parse(t) as NfcPayload;
    if (j?.kind && ["tap_to_tip", "merchant_card", "staff_badge", "payment_confirm"].includes(j.kind)) {
      return j;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

export async function prepareNfcTap(
  onRead?: (payload: NfcPayload) => void,
): Promise<{ ok: boolean; message: string }> {
  if (getNfcSupport() !== "available") {
    return {
      ok: false,
      message: "NFC tap-to-tip activates on supported Android Chrome once tags are provisioned.",
    };
  }
  try {
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
      if (rec?.recordType === "text" && rec.data) {
        const decoded = new TextDecoder().decode(rec.data);
        const payload = parseNfcTipPayload(decoded);
        if (payload) onRead?.(payload);
      }
    });
    await reader.scan();
    return { ok: true, message: "Hold your phone near the NFC tag…" };
  } catch (e) {
    return { ok: false, message: (e as Error).message ?? "NFC unavailable" };
  }
}
