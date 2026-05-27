import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import { downloadDataUrl, renderQrPrintCard } from "../lib/qrBranding";
import PageLoader from "../components/PageLoader";
import { Skeleton } from "../components/Skeleton";
import { NfcTapPanel } from "../components/NfcTapPanel";

type LinkRow = { token: string; created_at: string; scan_count?: number | null };
type GuardMeta = { id: string; display_name: string; merchant_name: string | null };

export default function GuardQR() {
  const { user } = useAuth();
  const toast = useToast();
  const [guard, setGuard] = useState<GuardMeta | null>(null);
  const [tipUrl, setTipUrl] = useState<string | null>(null);
  const [tipToken, setTipToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [printCardUrl, setPrintCardUrl] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data, error: err } = await supabase
        .from("guards")
        .select("id, display_name, merchant_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      if (!data?.id) {
        setError("Create your guard profile first.");
        setLoading(false);
        return;
      }
      let merchantName: string | null = null;
      if (data.merchant_id) {
        const { data: merch } = await supabase
          .from("merchants")
          .select("business_name")
          .eq("id", data.merchant_id)
          .maybeSingle();
        merchantName = merch?.business_name ?? null;
      }
      setGuard({
        id: data.id,
        display_name: data.display_name,
        merchant_name: merchantName,
      });
      const { data: rows, error: linkErr } = await supabase
        .from("tip_links")
        .select("token, created_at, scan_count")
        .eq("guard_id", data.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!linkErr && rows) setLinks(rows as LinkRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!tipUrl) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setQrDataUrl(null);
          setPrintCardUrl(null);
          setTipToken(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    void QRCode.toDataURL(tipUrl, { margin: 2, width: 280, color: { dark: "#0f172a", light: "#fbbf24" } }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [tipUrl]);

  async function buildPrintCard(url: string, name: string, merchantName: string | null) {
    setCardBusy(true);
    try {
      const card = await renderQrPrintCard({
        tipUrl: url,
        guardName: name,
        merchantName,
        subtitle: "Scan to tip · ZAR · TipGuard SA",
      });
      setPrintCardUrl(card);
    } catch (e) {
      setError((e as Error).message ?? "Could not render print card");
    } finally {
      setCardBusy(false);
    }
  }

  async function createLink() {
    if (!guard?.id) return;
    setBusy(true);
    setError(null);
    const { data, error: insErr } = await supabase.from("tip_links").insert({ guard_id: guard.id }).select("token").single();
    if (insErr || !data?.token) {
      setBusy(false);
      setError(insErr?.message ?? "Could not create link");
      return;
    }
    const token = data.token;
    const url = `${window.location.origin}/tip/${token}`;
    const { error: qcErr } = await supabase.from("qr_codes").insert({
      guard_id: guard.id,
      code_token: token,
      created_by: user?.id ?? null,
    });
    if (qcErr && import.meta.env.DEV) {
      console.warn("[GuardQR] qr_codes:", qcErr.message);
    }
    setTipUrl(url);
    setTipToken(token);
    setLinks((prev) => [{ token, created_at: new Date().toISOString(), scan_count: 0 }, ...prev]);
    setBusy(false);
    toast.success("New tip link ready.");
    void buildPrintCard(url, guard.display_name, guard.merchant_name);
  }

  async function copyUrl() {
    if (!tipUrl) return;
    try {
      await navigator.clipboard.writeText(tipUrl);
      toast.success("Link copied.");
    } catch {
      setError("Could not copy — select the URL manually.");
    }
  }

  function downloadQr() {
    if (!qrDataUrl) return;
    downloadDataUrl(qrDataUrl, `tipguard-qr-${guard?.id.slice(0, 8) ?? "tip"}.png`);
  }

  function downloadCard() {
    if (!printCardUrl) return;
    downloadDataUrl(printCardUrl, `tipguard-card-${guard?.id.slice(0, 8) ?? "tip"}.png`);
  }

  function openPrintView() {
    if (!printCardUrl) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html><html><head><title>TipGuard QR</title>
      <style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff}
      img{max-width:100%;height:auto}@media print{body{margin:0}}</style></head>
      <body><img src="${printCardUrl}" alt="TipGuard QR card" onload="window.print()" /></body></html>`);
    w.document.close();
  }

  if (loading) return <PageLoader />;

  return (
    <div className="shell qr-hub mx-auto max-w-lg space-y-5 px-4 py-8 pb-[max(4rem,env(safe-area-inset-bottom))] sm:px-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">QR & deep links</p>
        <h1 className="text-2xl font-black text-white">Tip links</h1>
        <p className="mt-1 text-sm text-slate-400">
          Mobile landing at <code className="text-amber-300/90">/tip/…</code>. Scans tracked server-side.
        </p>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}

      <NfcTapPanel fallbackTipToken={tipToken} />

      <button
        className="tap-target w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-4 font-black text-black disabled:opacity-50"
        type="button"
        onClick={() => void createLink()}
        disabled={busy || !guard}
      >
        {busy ? "Creating…" : "Generate new link & QR"}
      </button>

      {tipUrl && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4">
          {qrDataUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img
                src={qrDataUrl}
                alt="Tip QR"
                className="mx-auto max-w-full rounded-xl border border-amber-500/40 bg-white p-2 shadow-lg"
                width={280}
                height={280}
                loading="lazy"
                decoding="async"
              />
              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" className="text-sm font-bold text-amber-400 underline" onClick={downloadQr}>
                  Download QR PNG
                </button>
                <button
                  type="button"
                  className="text-sm font-bold text-amber-400 underline disabled:opacity-50"
                onClick={() => void buildPrintCard(tipUrl, guard?.display_name ?? "Guard", guard?.merchant_name ?? null)}
                  disabled={cardBusy}
                >
                  {cardBusy ? "Rendering card…" : "Refresh print card"}
                </button>
              </div>
            </div>
          ) : (
            <Skeleton style={{ width: 280, height: 280, margin: "0 auto", borderRadius: 16 }} />
          )}
          {printCardUrl && (
            <div className="flex flex-col items-center gap-2 border-t border-white/10 pt-3">
              <img src={printCardUrl} alt="Print card preview" className="max-h-64 rounded-lg border border-white/10" />
              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" className="text-sm font-bold text-emerald-400 underline" onClick={downloadCard}>
                  Download print card
                </button>
                <button type="button" className="text-sm font-bold text-emerald-400 underline" onClick={openPrintView}>
                  Print card
                </button>
              </div>
            </div>
          )}
          <p className="break-all text-center text-xs text-slate-300">{tipUrl}</p>
          <div className="flex gap-2">
            <button className="flex-1 rounded-xl border border-white/15 py-2 text-sm font-semibold text-white" type="button" onClick={() => void copyUrl()}>
              Copy URL
            </button>
            <button
              className="flex-1 rounded-xl border border-amber-500/40 py-2 text-sm font-semibold text-amber-200"
              type="button"
              onClick={() => void createLink()}
              disabled={busy || !guard}
            >
              Regenerate
            </button>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h2 className="text-sm font-bold uppercase text-slate-500">Recent links</h2>
        <ul className="mt-2 space-y-2">
          {links.length === 0 ? (
            <li className="text-sm text-slate-500">No links yet.</li>
          ) : (
            links.map((l) => (
              <li key={l.token} className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-2 text-xs">
                <code className="truncate text-amber-200/90">…{l.token.slice(-8)}</code>
                <span className="shrink-0 text-slate-500">{l.scan_count ?? 0} scans</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <Link to="/guard" className="block text-center text-sm font-semibold text-amber-400">
        ← Dashboard
      </Link>
    </div>
  );
}
