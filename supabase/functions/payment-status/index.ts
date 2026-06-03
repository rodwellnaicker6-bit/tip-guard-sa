import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, recordRateLimitHit } from "../_shared/rateLimit.ts";
import { isMaintenanceMode, maintenanceResponse } from "../_shared/maintenance.ts";
import { readPaymentStatusFromRows } from "../_shared/paymentStatusRead.ts";
import {
  isValidPaystackReference,
  settlePaystackReference,
} from "../_shared/paystackReferenceSettlement.ts";

async function callerMaySettle(
  req: Request,
  tipPayerId: string | null | undefined,
  txUserId: string | null | undefined,
): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;

  if (!auth.startsWith("Bearer ")) return false;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  return tipPayerId === user.id || txUserId === user.id;
}

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
      .select("status, amount_cents, commission_cents, customer_paid_cents, payer_id")
      .eq("paystack_reference", reference)
      .maybeSingle();

    const { data: txRow } = await service
      .from("transactions")
      .select("status, amount_cents, user_id")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (!tipRow && !txRow) {
      return new Response(JSON.stringify({ error: "Reference not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const readOnly = readPaymentStatusFromRows(
      reference,
      tipRow,
      txRow,
    );

    if (readOnly.settled) {
      const { settled: _s, ...payload } = readOnly;
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const maySettle = await callerMaySettle(
      req,
      (tipRow as { payer_id?: string } | null)?.payer_id,
      (txRow as { user_id?: string } | null)?.user_id,
    );

    if (!maySettle) {
      const { settled: _s, ...payload } = readOnly;
      return new Response(JSON.stringify(payload), {
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
