/**
 * Reconciliation batch (cron-ready). Compares recent payment_events vs transactions.
 * Auth: Bearer SUPABASE_SERVICE_ROLE_KEY
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey,
  );

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const [{ count: peProcessed }, { count: peFailed }, { count: txSucceeded }, { count: txFailed }] =
    await Promise.all([
      service.from("payment_events").select("id", { count: "exact", head: true })
        .eq("status", "processed").gte("created_at", since),
      service.from("payment_events").select("id", { count: "exact", head: true })
        .eq("status", "failed").gte("created_at", since),
      service.from("transactions").select("id", { count: "exact", head: true })
        .eq("status", "succeeded").gte("created_at", since),
      service.from("transactions").select("id", { count: "exact", head: true })
        .eq("status", "failed").gte("created_at", since),
    ]);

  const processed = peProcessed ?? 0;
  const succeeded = txSucceeded ?? 0;
  const mismatchCount = Math.abs(processed - succeeded);
  const matchedCount = Math.min(processed, succeeded);

  const details = {
    window_hours: 24,
    since,
    payment_events_processed: processed,
    payment_events_failed: peFailed ?? 0,
    transactions_succeeded: succeeded,
    transactions_failed: txFailed ?? 0,
    note: "Counts are directional; full Paystack export match is post-MVP (see src/payments/reconciliation.ts).",
  };

  const { error: logErr } = await service.from("reconciliation_log").insert({
    scope: "paystack_24h",
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
