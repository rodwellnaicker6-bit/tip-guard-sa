import { supabase } from "./supabase";
import { demoPaymentAnalytics, isDemoMode } from "./demoMode";

export type PaymentAnalytics = {
  tips_succeeded: number;
  tips_pending: number;
  tips_failed: number;
  volume_cents_succeeded: number;
  transactions_succeeded: number;
  transactions_failed: number;
  revenue_today_cents: number;
  revenue_week_cents: number;
  qr_scans_total: number;
  top_guards: { name: string; tip_count: number; volume_cents: number }[];
  merchant_volume: { name: string; tip_count: number; volume_cents: number }[];
  daily_revenue: { day: string; volume_cents: number; tip_count: number }[];
};

async function fallbackFromTables(): Promise<PaymentAnalytics | null> {
  const [tipsRes, txRes] = await Promise.all([
    supabase.from("tips").select("status, amount_cents, guard_id"),
    supabase.from("transactions").select("status"),
  ]);
  if (tipsRes.error) return null;
  const tips = tipsRes.data ?? [];
  const txs = txRes.data ?? [];
  const succeeded = tips.filter((t) => t.status === "succeeded");
  return {
    tips_succeeded: succeeded.length,
    tips_pending: tips.filter((t) => t.status === "pending").length,
    tips_failed: tips.filter((t) => t.status === "failed").length,
    volume_cents_succeeded: succeeded.reduce((s, t) => s + (t.amount_cents ?? 0), 0),
    transactions_succeeded: txs.filter((t) => t.status === "succeeded").length,
    transactions_failed: txs.filter((t) => t.status === "failed").length,
    revenue_today_cents: 0,
    revenue_week_cents: 0,
    qr_scans_total: 0,
    top_guards: [],
    merchant_volume: [],
    daily_revenue: [],
  };
}

export async function loadAdminPaymentAnalytics(): Promise<{
  data: PaymentAnalytics | null;
  error: string | null;
  source: "rpc" | "fallback" | "demo";
}> {
  const { data: raw, error: rpcErr } = await supabase.rpc("admin_payment_analytics");
  if (!rpcErr && raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { data: raw as PaymentAnalytics, error: null, source: "rpc" };
  }
  if (isDemoMode) {
    return { data: demoPaymentAnalytics(), error: null, source: "demo" };
  }
  const fallback = await fallbackFromTables();
  if (fallback) {
    return {
      data: fallback,
      error: rpcErr?.message ?? null,
      source: "fallback",
    };
  }
  return { data: null, error: rpcErr?.message ?? "Could not load analytics.", source: "fallback" };
}
