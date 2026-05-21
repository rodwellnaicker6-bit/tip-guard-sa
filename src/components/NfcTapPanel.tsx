import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNfcSupport, prepareNfcTap, type NfcPayload } from "../lib/nfc";

/** Web NFC scaffold — safe no-op on iOS Safari and desktop. */
export function NfcTapPanel() {
  const navigate = useNavigate();
  const support = getNfcSupport();
  const [message, setMessage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  function onPayload(payload: NfcPayload) {
    if (payload.token) {
      navigate(`/tip/${payload.token}`);
      return;
    }
    if (payload.guard_id) {
      navigate(`/customer/tip/${payload.guard_id}`);
    }
  }

  async function startScan() {
    setMessage(null);
    setScanning(true);
    const result = await prepareNfcTap(onPayload);
    setScanning(false);
    setMessage(result.message);
  }

  if (support === "unsupported") {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
        <p className="font-bold text-slate-300">NFC tap-to-tip</p>
        <p className="mt-1">
          Not supported in this browser. Use your QR code instead — works on iPhone and Android.
        </p>
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
    </div>
  );
}
