import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { zarFromCents } from "../lib/money";

type TipRow = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  payer_id: string | null;
};

export default function GuardHistory() {
  const { user } = useAuth();
  const [tips, setTips] = useState<TipRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data: g, error: gErr } = await supabase.from("guards").select("id").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      if (gErr || !g?.id) {
        setError(gErr?.message ?? "Guard profile not found.");
        return;
      }
      const { data, error: tErr } = await supabase
        .from("tips")
        .select("id, amount_cents, status, created_at, payer_id")
        .eq("guard_id", g.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (tErr) setError(tErr.message);
      else setTips((data as TipRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <div className="shell stack">
      <h2>Tip history</h2>
      {error && <div className="error">{error}</div>}
      <div className="stack mt">
        {tips.length === 0 && !error && <p>No tips yet.</p>}
        {tips.map((t) => (
          <div key={t.id} className="card stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong style={{ color: "var(--text)" }}>{zarFromCents(t.amount_cents)}</strong>
              <span className="badge" style={{ background: "var(--border)", color: "var(--muted)" }}>
                {t.status}
              </span>
            </div>
            <p style={{ fontSize: 12 }}>{new Date(t.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <Link to="/guard">Dashboard</Link>
    </div>
  );
}
