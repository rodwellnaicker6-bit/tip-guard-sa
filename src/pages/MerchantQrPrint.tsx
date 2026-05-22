import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import PageLoader from "../components/PageLoader";

/** Minimal HTML print view for branded QR cards (browser print dialog). */
export default function MerchantQrPrint() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const label = params.get("label") ?? "Tip here";
  const amount = params.get("amount") ?? "";
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [venue, setVenue] = useState("TipGuard SA");
  const [ready, setReady] = useState(false);

  const tipUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/tip/${token}${amount ? `?amount=${encodeURIComponent(amount)}` : ""}`
      : "";

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      const { data } = await supabase.from("merchants").select("business_name").eq("user_id", user.id).maybeSingle();
      if (data?.business_name) setVenue(data.business_name);
      setReady(true);
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!tipUrl) return;
    void import("qrcode").then((QRCode) =>
      QRCode.default.toDataURL(tipUrl, { width: 400, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } }).then(setQrSrc),
    );
  }, [tipUrl]);

  if (!ready) return <PageLoader />;

  return (
    <div className="qr-print-page min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .qr-print-card { page-break-inside: avoid; box-shadow: none !important; border: 2px solid #e2e8f0 !important; }
        }
        .qr-print-card {
          max-width: 420px;
          margin: 2rem auto;
          padding: 2rem;
          border: 2px solid #cbd5e1;
          border-radius: 16px;
          text-align: center;
          font-family: system-ui, sans-serif;
        }
      `}</style>
      <p className="no-print px-4 py-3 text-center text-sm text-slate-600">
        <button type="button" className="mr-4 font-bold text-amber-700" onClick={() => window.print()}>
          Print
        </button>
        <Link to="/merchant/qr" className="text-slate-500">
          ← QR manager
        </Link>
      </p>
      <article className="qr-print-card">
        <p className="text-sm font-bold uppercase tracking-wider text-amber-600">TipGuard SA</p>
        <h1 className="mt-2 text-2xl font-black">{venue}</h1>
        <p className="mt-1 text-lg text-slate-600">{label}</p>
        {qrSrc ? (
          <img src={qrSrc} alt="QR code" className="mx-auto mt-6" width={280} height={280} />
        ) : (
          <p className="mt-6 text-sm text-slate-400">Add ?token= to the URL or open Print from QR manager.</p>
        )}
        <p className="mt-4 text-sm text-slate-500">Scan to tip · ZAR only</p>
        {amount ? <p className="mt-1 font-bold text-amber-700">Suggested: R{amount}</p> : null}
        <p className="mt-4 break-all font-mono text-[10px] text-slate-400">{tipUrl.replace(/^https?:\/\//, "")}</p>
      </article>
    </div>
  );
}
