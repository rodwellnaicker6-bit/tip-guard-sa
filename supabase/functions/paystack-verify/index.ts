import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, recordRateLimitHit } from "../_shared/rateLimit.ts";
import { isMaintenanceMode, maintenanceResponse } from "../_shared/maintenance.ts";
import { runFraudChecks } from "../_shared/fraudCheck.ts";
import { settlePaystackReference } from "../_shared/paystackReferenceSettlement.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (isMaintenanceMode()) return maintenanceResponse();

  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
    if (!secret) {
      return new Response(JSON.stringify({ error: "PAYSTACK_SECRET_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null) as { reference?: string } | null;
    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const allowed = await checkRateLimit(service, { userId: user.id, route: "paystack-verify" }, {
      max: 60,
      windowSec: 60,
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Too many verify attempts", code: "rate_limit" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await recordRateLimitHit(service, { userId: user.id, route: "paystack-verify" });

    const reference = body?.reference?.trim();
    if (!reference) {
      return new Response(JSON.stringify({ error: "reference required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tipPre } = await service
      .from("tips")
      .select("amount_cents")
      .eq("paystack_reference", reference)
      .maybeSingle();

    const fraud = await runFraudChecks(service, {
      userId: user.id,
      amountCents: (tipPre as { amount_cents?: number } | null)?.amount_cents,
      reference,
      route: "paystack-verify",
    });
    if (fraud.blocked && !fraud.rpcUnavailable) {
      return new Response(
        JSON.stringify({ error: "Verify blocked by fraud policy", code: "fraud_blocked" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: tip } = await service
      .from("tips")
      .select("id, status, amount_cents, guard_id, payer_id")
      .eq("paystack_reference", reference)
      .maybeSingle();

    const { data: tx } = await service
      .from("transactions")
      .select("id, status, amount_cents, type, user_id")
      .eq("paystack_reference", reference)
      .maybeSingle();

    const ownsRow = tip?.payer_id === user.id || tx?.user_id === user.id;
    if (!ownsRow) {
      return new Response(JSON.stringify({ error: "Reference not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await settlePaystackReference(service, secret, reference);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
