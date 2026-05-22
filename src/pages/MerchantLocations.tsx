import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import PageLoader from "../components/PageLoader";
import { FetchError } from "../components/FetchError";
import { sanitizeDisplayName } from "../lib/sanitize";

type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  province: string | null;
  active: boolean;
};

export default function MerchantLocations() {
  const { user } = useAuth();
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let c = false;
    (async () => {
      const { data: m } = await supabase.from("merchants").select("id").eq("user_id", user.id).maybeSingle();
      if (c || !m?.id) {
        setLoading(false);
        return;
      }
      setMerchantId(m.id);
      const { data, error: err } = await supabase
        .from("merchant_locations")
        .select("id, name, address, province, active")
        .eq("merchant_id", m.id)
        .order("name");
      if (!c) {
        if (err) setError(err.message);
        else setRows((data as LocationRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [user?.id, reload]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!merchantId || !name.trim()) return;
    setBusy(true);
    setError(null);
    const safeName = sanitizeDisplayName(name);
    const safeAddress = address.trim() ? sanitizeDisplayName(address) : null;
    const { error: insErr } = await supabase.from("merchant_locations").insert({
      merchant_id: merchantId,
      name: safeName,
      address: safeAddress,
    });
    setBusy(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setName("");
    setAddress("");
    const { data } = await supabase
      .from("merchant_locations")
      .select("id, name, address, province, active")
      .eq("merchant_id", merchantId)
      .order("name");
    setRows((data as LocationRow[]) ?? []);
  }

  if (loading) return <PageLoader />;

  return (
    <div className="shell mx-auto max-w-lg space-y-5 px-5 py-8 pb-24">
      <header>
        <p className="text-xs font-bold uppercase text-slate-500">Merchant</p>
        <h1 className="text-2xl font-black text-white">Locations</h1>
        <p className="mt-1 text-sm text-slate-400">Sites where your guards operate. QR codes can be tied to a location.</p>
      </header>
      {error ? <FetchError message={error} onRetry={() => setReload((n) => n + 1)} /> : null}
      <Link className="text-sm text-amber-400" to="/merchant/qr">
        Manage QR codes for locations →
      </Link>
      <form className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4" onSubmit={onAdd}>
        <input
          className="field tap-target w-full"
          placeholder="Location name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="field tap-target w-full"
          placeholder="Address (optional)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button className="btn-gold tap-target w-full rounded-xl py-3 font-bold" type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add location"}
        </button>
      </form>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="font-bold text-white">{r.name}</p>
            <p className="text-xs text-slate-500">{r.address ?? "—"} · {r.active ? "Active" : "Inactive"}</p>
          </li>
        ))}
      </ul>
      <Link className="text-amber-400" to="/merchant">
        Back to dashboard
      </Link>
    </div>
  );
}
