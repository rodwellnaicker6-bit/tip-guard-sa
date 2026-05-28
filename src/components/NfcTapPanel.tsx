import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { stabilLog } from "../lib/stabilLog";
import { fallbackToQR, getNfcSupport, prepareNfcTap, type NfcPayload } from "../lib/nfc";

/** Web NFC scaffold — safe no-op on iOS Safari and desktop. */
export function NfcTapPanel({ fallbackTipToken }: { fallbackTipToken?: string | null }) {
  const navigate = useNavigate();
  const support = getNfcSupport();
  const [message, setMessage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScanFailed, setLastScanFailed] = useState(false);

  function onPayload(payload: NfcPayload) {
    try {
      if (payload.token) {
        void import("../pages/QrTipLanding");
        navigate(`/tip/${encodeURIComponent(payload.token)}`);
        return;
      }
      if (payload.guard_id) {
        void import("../pages/TipCheckout");
        navigate(`/customer/tip/${encodeURIComponent(payload.guard_id)}`);
      }
    } catch (e) {
      stabilLog("nfc", "NFC payload navigation failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      fallbackToQR(navigate, fallbackTipToken ?? undefined);
    }
  }

  async function startScan() {
    setMessage(null);
    setLastScanFailed(false);
    setScanning(true);
    void import("../pages/QrTipLanding");
    void import("../pages/TipCheckout");
    try {
      const result = await prepareNfcTap(onPayload);
      setMessage(result.message);
      setLastScanFailed(!result.ok);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "NFC scan failed";
      stabilLog("nfc", "startScan unexpected", { message: msg });
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

  return (
    <div className="rounded-2xl border border-dashed border-amber-500/25 bg-amber-500/5 px-4 py-3">
      <p className="text-sm font-bold text-amber-200">NFC tap-to-tip (beta)</p>
      <p className="mt-1 text-xs text-slate-400">Android Chrome over HTTPS. Hold the phone near a provisioned tag.</p>
      <button
        type="button"
        className="tap-target mt-3 w-full rounded-xl border border-amber-500/40 py-2.5 text-sm font-bold text-amber-200 disabled:opacity-50"
        disabled={scanning}
        onClick={() => void startScan()}
      >
        {scanning ? "Listening…" : "Scan NFC tag"}
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
