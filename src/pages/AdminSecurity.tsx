import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import PageLoader from "../components/PageLoader";

type FraudRow = {
  id: string;
  kind: string;
  guard_id: string | null;
  user_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

type FlaggedGuard = { guard_id: string; display_name: string; flagged_at: string };

export default function AdminSecurity() {
  const { signOut } = useAuth();
  const [section, setSection] = useState<"mfa" | "fraud">("fraud");
  const [factors, setFactors] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [fraud, setFraud] = useState<FraudRow[]>([]);
  const [flagged, setFlagged] = useState<FlaggedGuard[]>([]);
  const [velocity1h, setVelocity1h] = useState<number | null>(null);
  const [velocity24h, setVelocity24h] = useState<number | null>(null);

  const loadFraud = useCallback(async () => {
    const since1h = new Date(Date.now() - 60 * 60_000).toISOString();
    const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

    const [fRes, pe1h, pe24h] = await Promise.all([
      supabase
        .from("fraud_events")
        .select("id, kind, guard_id, user_id, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("payment_events").select("id", { count: "exact", head: true }).gte("created_at", since1h),
      supabase.from("payment_events").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    ]);

    if (!fRes.error && fRes.data) {
      const rows = fRes.data as FraudRow[];
      setFraud(rows);
      const flags = rows
        .filter((r) => r.kind === "admin_flag" || r.kind === "verification_rejected")
        .map((r) => {
          const gid = r.guard_id ?? (typeof r.detail?.guard_id === "string" ? r.detail.guard_id : null);
          const name = typeof r.detail?.display_name === "string" ? r.detail.display_name : gid?.slice(0, 8) ?? "—";
          return gid ? { guard_id: gid, display_name: name, flagged_at: r.created_at } : null;
        })
        .filter((x): x is FlaggedGuard => x != null);
      const seen = new Set<string>();
      setFlagged(flags.filter((f) => {
        if (seen.has(f.guard_id)) return false;
        seen.add(f.guard_id);
        return true;
      }));
    }
    if (!pe1h.error) setVelocity1h(pe1h.count ?? 0);
    if (!pe24h.error) setVelocity24h(pe24h.count ?? 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: mfaErr } = await supabase.auth.mfa.listFactors();
      if (!cancelled) {
        if (mfaErr) {
          setError(mfaErr.message);
          setFactors("");
        } else {
          const all = [...(data?.totp ?? []), ...(data?.phone ?? [])];
          setFactors(
            all.length
              ? all.map((f) => `${f.factor_type}: ${f.friendly_name ?? f.id}`).join(" · ")
              : "No MFA factors enrolled in this session.",
          );
        }
      }
      await loadFraud();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFraud]);

  const fraudByKind = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fraud) {
      m.set(f.kind, (m.get(f.kind) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [fraud]);

  if (!ready) return <PageLoader />;

  return (
    <div className="shell mx-auto max-w-2xl space-y-5 px-5 py-8 pb-24">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Admin</p>
        <h1 className="text-2xl font-black text-white">Security & fraud</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">
          MFA status for this session plus fraud_events, flagged guards, and payment velocity from payment_events.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSection("fraud")}
          className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-bold ${
            section === "fraud" ? "bg-amber-500 text-black" : "border border-white/10 bg-white/5 text-slate-300"
          }`}
        >
          Fraud dashboard
        </button>
        <button
          type="button"
          onClick={() => setSection("mfa")}
          className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-bold ${
            section === "mfa" ? "bg-amber-500 text-black" : "border border-white/10 bg-white/5 text-slate-300"
          }`}
        >
          MFA
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 break-words">
          {error}
        </div>
      )}

      {section === "mfa" && !error && factors && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
          <p className="text-xs font-bold uppercase text-slate-500">Session factors</p>
          <p className="mt-2 break-words text-sm text-slate-300">{factors}</p>
        </div>
      )}

      {section === "fraud" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Payment events (1h)</p>
              <p className="mt-1 text-2xl font-black text-amber-400">{velocity1h ?? "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Payment events (24h)</p>
              <p className="mt-1 text-2xl font-black text-amber-400">{velocity24h ?? "—"}</p>
            </div>
          </div>

          {fraudByKind.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <p className="text-xs font-bold uppercase text-slate-500">Events by kind (sample)</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {fraudByKind.map(([kind, n]) => (
                  <li key={kind}>
                    <span className="font-mono text-amber-200/90">{kind}</span> · {n}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase text-slate-500">Flagged guards</h2>
            {flagged.length === 0 ? (
              <p className="text-sm text-slate-500">No admin_flag or verification_rejected events.</p>
            ) : (
              flagged.map((g) => (
                <div key={g.guard_id} className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm">
                  <p className="font-bold text-amber-200">{g.display_name}</p>
                  <p className="text-xs text-slate-500">
                    {g.guard_id.slice(0, 8)}… · {new Date(g.flagged_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase text-slate-500">Recent fraud_events</h2>
            {fraud.length === 0 ? (
              <p className="text-sm text-slate-500">No rows yet.</p>
            ) : (
              fraud.slice(0, 20).map((f) => (
                <div key={f.id} className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200/90">
                  <strong>{f.kind}</strong>
                  {f.guard_id && <span className="text-slate-500"> · guard {f.guard_id.slice(0, 8)}…</span>}
                  <span className="text-slate-500"> · {new Date(f.created_at).toLocaleString()}</span>
                </div>
              ))
            )}
          </section>
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          className="min-h-[48px] flex-1 rounded-2xl border border-white/10 py-3 text-sm font-semibold text-slate-200"
          type="button"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
        <Link
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-amber-500/15 py-3 text-center text-sm font-bold text-amber-200"
          to="/admin"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
