import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { zarFromCents } from "../lib/money";

type TipHistoryRow = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  guard_display_name: string;
};

export default function CustomerHistory() {
  const { user } = useAuth();
  const [tips, setTips] = useState<TipHistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: tErr } = await supabase.rpc("get_customer_tip_history");
      if (cancelled) return;
      if (tErr) setError(tErr.message);
      else setTips((data as TipHistoryRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <div className="shell stack">
      <h2>Your tips</h2>
      {loading && <p>Loading…</p>}
      {error && <div className="error">{error}</div>}
      <div className="stack mt">
        {!loading && tips.length === 0 && !error && <p>No tips sent yet.</p>}
        {tips.map((t) => (
          <div key={t.id} className="card stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong style={{ color: "var(--text)" }}>{t.guard_display_name ?? "Guard"}</strong>
              <span>{zarFromCents(t.amount_cents)}</span>
            </div>
            <p style={{ fontSize: 12 }}>
              {new Date(t.created_at).toLocaleString()} · {t.status}
            </p>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <Link to="/customer/wallet">Wallet</Link>
        <Link to="/customer">Browse guards</Link>
      </div>
    </div>
  );
}
