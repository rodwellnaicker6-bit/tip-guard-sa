/**
 * Cron-ready stub: drains webhook_retry_queue (pending, due).
 * Schedule via Supabase Dashboard → Integrations → Cron, or pg_cron.
 * Auth: Bearer SUPABASE_SERVICE_ROLE_KEY
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const BACKOFF_MINUTES = [5, 15, 60, 240, 720];

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

  const { data: rows, error: selErr } = await service
    .from("webhook_retry_queue")
    .select("id, provider, event_id, event_type, payload, attempts, max_attempts")
    .eq("status", "pending")
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(25);

  if (selErr) {
    console.error("webhook_retry_select", selErr);
    return new Response(JSON.stringify({ error: "select_failed" }), { status: 500 });
  }

  let processed = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const nextAttempt = (row.attempts ?? 0) + 1;
    await service.from("webhook_retry_queue").update({
      status: "processing",
      attempts: nextAttempt,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);

    // Stub: full replay posts to paystack-webhook internally (post-MVP).
    // For now, log and reschedule or mark failed after max_attempts.
    const maxAttempts = row.max_attempts ?? 5;
    if (nextAttempt >= maxAttempts) {
      await service.from("webhook_retry_queue").update({
        status: "failed",
        error_message: "max_attempts_exceeded",
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      failed++;
      continue;
    }

    const backoffIdx = Math.min(nextAttempt - 1, BACKOFF_MINUTES.length - 1);
    const nextRetry = new Date(Date.now() + BACKOFF_MINUTES[backoffIdx] * 60_000).toISOString();

    await service.from("webhook_retry_queue").update({
      status: "pending",
      next_retry_at: nextRetry,
      error_message: "retry_scheduled_stub",
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);

    console.log(JSON.stringify({
      msg: "webhook_retry_stub",
      id: row.id,
      event_id: row.event_id,
      attempt: nextAttempt,
      next_retry_at: nextRetry,
    }));
    processed++;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      scanned: rows?.length ?? 0,
      rescheduled: processed,
      failed,
      note: "Replay to paystack-webhook is post-MVP; rows are rescheduled for operator review.",
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
