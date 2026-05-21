import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import PageLoader from "../components/PageLoader";
import { sanitizeDisplayName } from "../lib/sanitize";

type GuardRow = {
  id: string;
  display_name: string;
  location: string | null;
  verified: boolean;
  location_id: string | null;
};

type LocationOpt = { id: string; name: string };

export default function MerchantGuards() {
  const { user } = useAuth();
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [guards, setGuards] = useState<GuardRow[]>([]);
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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
      const [gRes, lRes] = await Promise.all([
        supabase
          .from("guards")
          .select("id, display_name, location, verified, location_id")
          .eq("merchant_id", m.id)
          .order("display_name"),
        supabase.from("merchant_locations").select("id, name").eq("merchant_id", m.id).eq("active", true),
      ]);
      if (!c) {
        if (gRes.error) setError(gRes.error.message);
        else setGuards((gRes.data as GuardRow[]) ?? []);
        if (!lRes.error && lRes.data) setLocations(lRes.data as LocationOpt[]);
        setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [user?.id]);

  async function linkGuard() {
    if (!merchantId || !displayName.trim()) return;
    setBusy(true);
    setError(null);
    const { data: existing } = await supabase
      .from("guards")
      .select("id")
      .eq("display_name", displayName.trim())
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (existing?.id) {
      setBusy(false);
      setError("A guard with this name is already linked to your merchant.");
      return;
    }
    const { error: insErr } = await supabase.from("guards").insert({
      display_name: sanitizeDisplayName(displayName),
      merchant_id: merchantId,
      location_id: locationId || null,
      location: locations.find((l) => l.id === locationId)?.name ?? null,
      user_id: null,
    });
    setBusy(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setDisplayName("");
    const { data } = await supabase
      .from("guards")
      .select("id, display_name, location, verified, location_id")
      .eq("merchant_id", merchantId)
      .order("display_name");
    setGuards((data as GuardRow[]) ?? []);
  }

  if (loading) return <PageLoader />;

  return (
    <div className="shell mx-auto max-w-lg space-y-5 px-5 py-8 pb-24">
      <header>
        <p className="text-xs font-bold uppercase text-slate-500">Merchant</p>
        <h1 className="text-2xl font-black text-white">Your guards</h1>
        <p className="mt-1 text-sm text-slate-400">
          Guards under your merchant account. Verification is completed by TipGuard operators.
        </p>
      </header>
      {error && <div className="error">{error}</div>}
      <section className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold text-slate-200">Register guard profile</p>
        <input
          className="field tap-target w-full"
          placeholder="Guard display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <select
          className="field tap-target w-full"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          <option value="">No location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-gold tap-target w-full rounded-xl py-3 font-bold"
          disabled={busy}
          onClick={() => void linkGuard()}
        >
          {busy ? "Saving…" : "Add guard"}
        </button>
      </section>
      <ul className="space-y-2">
        {guards.map((g) => (
          <li key={g.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="font-bold text-white">{g.display_name}</p>
              <p className="text-xs text-slate-500">
                {g.location ?? "—"} · {g.verified ? "Verified" : "Pending"}
              </p>
            </div>
            <Link className="text-xs font-bold text-amber-400" to={`/guard/qr`}>
              QR
            </Link>
          </li>
        ))}
      </ul>
      <Link className="text-amber-400" to="/merchant">
        Back to dashboard
      </Link>
    </div>
  );
}
