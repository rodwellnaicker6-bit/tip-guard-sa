import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import PageLoader from "../components/PageLoader";

type DisputeRow = {
  id: string;
  tip_id: string | null;
  status: string;
  reason: string | null;
  resolution_note: string | null;
  created_at: string;
};

export default function MerchantDisputes() {
  const { user } = useAuth();
  const toast = useToast();
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [reason, setReason] = useState("");
  const [tipId, setTipId] = useState("");
  const [ready, setReady] = useState(false);

  const load = useCallback(async (mid: string) => {
    const { data } = await supabase
      .from("disputes")
      .select("id, tip_id, status, reason, resolution_note, created_at")
      .eq("merchant_id", mid)
      .order("created_at", { ascending: false });
    setRows((data as DisputeRow[]) ?? []);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data: m } = await supabase.from("merchants").select("id").eq("user_id", user.id).maybeSingle();
      if (cancelled || !m?.id) {
        setReady(true);
        return;
      }
      setMerchantId(m.id);
      await load(m.id);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, load]);

  async function submitDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!merchantId || !reason.trim()) return;
    const { error } = await supabase.from("disputes").insert({
      merchant_id: merchantId,
      tip_id: tipId.trim() || null,
      reason: reason.trim(),
      created_by: user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Dispute submitted.");
    setReason("");
    setTipId("");
    void load(merchantId);
  }

  if (!ready) return <PageLoader />;

  if (!merchantId) {
    return (
      <div className="shell mx-auto max-w-lg px-5 py-10">
        <p className="text-slate-400">Merchant profile required.</p>
        <Link to="/merchant/setup" className="text-amber-400">
          Set up venue
        </Link>
      </div>
    );
  }

  return (
    <div className="shell mx-auto max-w-lg space-y-5 px-5 py-8 pb-16">
      <header>
        <p className="muted-label">Merchant</p>
        <h2 className="font-black text-white">Disputes</h2>
        <p className="text-sm text-slate-500">Submit a dispute for admin review. Resolution is handled by operations.</p>
      </header>

      <form className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4" onSubmit={(e) => void submitDispute(e)}>
        <label className="block text-xs font-bold text-slate-500">
          Tip ID (optional)
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            value={tipId}
            onChange={(ev) => setTipId(ev.target.value)}
            placeholder="UUID"
          />
        </label>
        <label className="block text-xs font-bold text-slate-500">
          Reason
          <textarea
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            rows={3}
            required
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
          />
        </label>
        <button type="submit" className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-black">
          Submit dispute
        </button>
      </form>

      <section className="space-y-2">
        <h3 className="text-sm font-bold uppercase text-slate-500">Your disputes</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">None yet.</p>
        ) : (
          rows.map((d) => (
            <div key={d.id} className="rounded-xl border border-white/10 p-3 text-sm">
              <p className="font-bold text-amber-300">{d.status}</p>
              <p className="text-slate-400">{d.reason}</p>
              {d.resolution_note && <p className="mt-1 text-xs text-emerald-300/80">Resolution: {d.resolution_note}</p>}
              <p className="mt-1 text-xs text-slate-600">{new Date(d.created_at).toLocaleString()}</p>
            </div>
          ))
        )}
      </section>

      <Link to="/merchant" className="text-sm font-semibold text-amber-400">
        ← Venue hub
      </Link>
    </div>
  );
}
