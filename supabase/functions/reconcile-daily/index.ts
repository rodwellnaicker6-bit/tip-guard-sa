/**
 * Daily financial reconciliation: payment_events vs transactions for a date range.
 * Auth: Bearer SUPABASE_SERVICE_ROLE_KEY (cron) or admin session JWT (/admin/transactions)
 * Body (optional): { "from_date": "2026-05-20", "to_date": "2026-05-21" }
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { authorizeServiceOrAdmin } from "../_shared/adminAuth.ts";

function parseDay(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authResult = await authorizeServiceOrAdmin(req);
  if (!authResult.ok) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  const service = authResult.service;

  let body: { from_date?: string; to_date?: string } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw) as typeof body;
  } catch {
    /* default range */
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const from = parseDay(body.from_date, yesterday);
  const toEnd = parseDay(body.to_date, today);
  const toExclusive = new Date(toEnd);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

  const since = from.toISOString();
  const until = toExclusive.toISOString();

  const [
    { count: peProcessed },
    { count: peFailed },
    { count: txSucceeded },
    { count: txFailed },
    { count: tipsSucceeded },
  ] = await Promise.all([
    service.from("payment_events").select("id", { count: "exact", head: true })
      .eq("status", "processed").gte("created_at", since).lt("created_at", until),
    service.from("payment_events").select("id", { count: "exact", head: true })
      .eq("status", "failed").gte("created_at", since).lt("created_at", until),
    service.from("transactions").select("id", { count: "exact", head: true })
      .eq("status", "succeeded").gte("created_at", since).lt("created_at", until),
    service.from("transactions").select("id", { count: "exact", head: true })
      .eq("status", "failed").gte("created_at", since).lt("created_at", until),
    service.from("tips").select("id", { count: "exact", head: true })
      .eq("status", "succeeded").gte("created_at", since).lt("created_at", until),
  ]);

  const processed = peProcessed ?? 0;
  const succeeded = txSucceeded ?? 0;
  const mismatchCount = Math.abs(processed - succeeded);
  const matchedCount = Math.min(processed, succeeded);

  const details = {
    from_date: since.slice(0, 10),
    to_date: until.slice(0, 10),
    since,
    until,
    payment_events_processed: processed,
    payment_events_failed: peFailed ?? 0,
    transactions_succeeded: succeeded,
    transactions_failed: txFailed ?? 0,
    tips_succeeded: tipsSucceeded ?? 0,
  };

  const { error: logErr } = await service.from("reconciliation_log").insert({
    scope: "reconcile_daily",
    matched_count: matchedCount,
    mismatch_count: mismatchCount,
    details,
  });

  if (logErr) {
    console.error("reconciliation_log_insert", logErr);
    return new Response(JSON.stringify({ error: "log_failed", details: logErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      matched_count: matchedCount,
      mismatch_count: mismatchCount,
      details,
      checkedAt: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
