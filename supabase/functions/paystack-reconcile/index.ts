/**
 * Paystack reconciliation stub (post-MVP).
 * Compare Paystack transaction exports with public.transactions / tips by reference.
 * Schedule via pg_cron or external worker; do not expose to browsers.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

  return new Response(
    JSON.stringify({
      status: "not_implemented",
      message: "Reconciliation batch job is post-MVP. See src/payments/reconciliation.ts",
      checkedAt: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
