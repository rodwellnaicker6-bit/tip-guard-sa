import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, recordRateLimitHit } from "../_shared/rateLimit.ts";
import { isMaintenanceMode, maintenanceResponse } from "../_shared/maintenance.ts";
import {
  isValidPaystackReference,
  settlePaystackReference,
} from "../_shared/paystackReferenceSettlement.ts";

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

    const body = await req.json().catch(() => null) as { reference?: string } | null;
    const reference = body?.reference?.trim() ?? "";
    if (!reference || !isValidPaystackReference(reference)) {
      return new Response(JSON.stringify({ error: "Invalid or missing reference" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const allowed = await checkRateLimit(
      service,
      { userId: `ref:${reference.slice(0, 24)}`, route: "payment-status" },
      { max: 90, windowSec: 300 },
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Too many status checks", code: "rate_limit" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await recordRateLimitHit(service, { userId: `ref:${reference.slice(0, 24)}`, route: "payment-status" });

    const { data: tipRow } = await service
      .from("tips")
      .select("status, amount_cents")
      .eq("paystack_reference", reference)
      .maybeSingle();

    const { data: txRow } = await service
      .from("transactions")
      .select("status, amount_cents")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (!tipRow && !txRow) {
      return new Response(JSON.stringify({ error: "Reference not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const alreadyDone =
      tipRow?.status === "succeeded" ||
      tipRow?.status === "failed" ||
      txRow?.status === "succeeded" ||
      txRow?.status === "failed";

    const result = alreadyDone
      ? {
          reference,
          paystack_status: tipRow?.status === "succeeded" || txRow?.status === "succeeded" ? "success" : "failed",
          verified: tipRow?.status === "succeeded" || txRow?.status === "succeeded",
          tip_status: tipRow?.status ?? null,
          transaction_status: txRow?.status ?? null,
          amount_cents: tipRow?.amount_cents ?? txRow?.amount_cents ?? null,
        }
      : await settlePaystackReference(service, secret, reference);

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
