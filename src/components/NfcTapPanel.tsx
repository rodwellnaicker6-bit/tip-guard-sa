import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { recordError } from "../lib/errorTelemetry";
import { stabilLog } from "../lib/stabilLog";
import { resolveTipTarget } from "../lib/resolveTipTarget";
import { fallbackToQR, getNfcSupport, prepareNfcTap, sanitizeTipToken, type NfcPayload } from "../lib/nfc";

/** Web NFC — resolves token server-side before navigation (replay-safe). */
export function NfcTapPanel({ fallbackTipToken }: { fallbackTipToken?: string | null }) {
  const navigate = useNavigate();
  const support = getNfcSupport();
  const [message, setMessage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [lastScanFailed, setLastScanFailed] = useState(false);
  const resolveInFlightRef = useRef(false);

  async function handleResolvedToken(token: string) {
    if (resolveInFlightRef.current) {
      stabilLog("nfc", "resolve skipped (in flight)");
      return;
    }
    const safe = sanitizeTipToken(token);
    if (!safe) {
      stabilLog("nfc", "resolve rejected invalid token format");
      recordError("nfc_resolve", "invalid token format", { code: "nfc_token_format" });
      setMessage("This tag has an invalid tip link. Use QR instead.");
      setLastScanFailed(true);
      return;
    }
    resolveInFlightRef.current = true;
    setResolving(true);
    setMessage("Checking tip link…");
    try {
      const { target, error: resolveErr } = await resolveTipTarget(safe);
      if (!target?.guard_id) {
        const msg = resolveErr ?? "This tip link is invalid or expired.";
        stabilLog("nfc", "resolve_tip_target failed after NFC", { message: msg });
        recordError("nfc_resolve", msg, { code: "resolve_tip_target" });
        setMessage(msg);
        setLastScanFailed(true);
        return;
      }
      stabilLog("nfc", "resolve_tip_target ok after NFC", { guardId: target.guard_id });
      void import("../pages/QrTipLanding");
      navigate(`/tip/${encodeURIComponent(safe)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not verify this tip link.";
      stabilLog("nfc", "resolve_tip_target exception after NFC", { message: msg });
      recordError("nfc_resolve", msg, { code: "exception" });
      setMessage(msg);
      setLastScanFailed(true);
    } finally {
      resolveInFlightRef.current = false;
      setResolving(false);
    }
  }

  function onPayload(payload: NfcPayload, outcome: "ok" | "invalid_payload" | "duplicate" | "forbidden_url") {
    if (outcome === "duplicate") {
      setMessage("Tag already read — hold steady or use QR.");
      return;
    }
    if (outcome === "forbidden_url") {
      setMessage("This tag points to an unsupported link. Use the official TipGuard QR.");
      setLastScanFailed(true);
      return;
    }
    if (outcome === "invalid_payload" || !payload.token) {
      setMessage("Could not read this tag. Try QR tipping instead.");
      setLastScanFailed(true);
      return;
    }
    void handleResolvedToken(payload.token);
  }

  async function startScan() {
    setMessage(null);
    setLastScanFailed(false);
    setScanning(true);
    void import("../pages/QrTipLanding");
    try {
      const result = await prepareNfcTap(onPayload);
      setMessage(result.message);
      setLastScanFailed(!result.ok);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "NFC scan failed";
      stabilLog("nfc", "startScan unexpected", { message: msg });
      recordError("nfc_scan", msg, { code: "nfc_start" });
      setMessage(msg);
      setLastScanFailed(true);
    } finally {
      setScanning(false);
    }
  }

  if (support === "unsupported") {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
        <p className="font-bold text-slate-300">NFC tap-to-tip</p>
        <p className="mt-1">
          Not supported in this browser (iPhone uses QR). Your printed QR code always works.
        </p>
        <button
          type="button"
          className="tap-target mt-3 w-full rounded-xl border border-white/15 py-2.5 text-sm font-bold text-amber-200"
          onClick={() => fallbackToQR(navigate, fallbackTipToken ?? undefined)}
        >
          Open QR tipping
        </button>
      </div>
    );
  }

  const busy = scanning || resolving;

  return (
    <div className="rounded-2xl border border-dashed border-amber-500/25 bg-amber-500/5 px-4 py-3">
      <p className="text-sm font-bold text-amber-200">NFC tap-to-tip (beta)</p>
      <p className="mt-1 text-xs text-slate-400">Android Chrome over HTTPS. Hold the phone near a provisioned tag.</p>
      <button
        type="button"
        className="tap-target mt-3 w-full rounded-xl border border-amber-500/40 py-2.5 text-sm font-bold text-amber-200 disabled:opacity-50"
        disabled={busy}
        onClick={() => void startScan()}
      >
        {resolving ? "Verifying link…" : scanning ? "Listening…" : "Scan NFC tag"}
      </button>
      {message ? <p className="mt-2 text-xs text-slate-500">{message}</p> : null}
      {lastScanFailed ? (
        <button
          type="button"
          className="tap-target mt-3 w-full rounded-xl border border-white/15 py-2.5 text-sm font-bold text-amber-200"
          onClick={() => fallbackToQR(navigate, fallbackTipToken ?? undefined)}
        >
          Open QR tipping instead
        </button>
      ) : null}
    </div>
  );
}
