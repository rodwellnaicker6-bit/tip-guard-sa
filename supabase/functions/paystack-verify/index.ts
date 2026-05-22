import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, recordRateLimitHit } from "../_shared/rateLimit.ts";
import { isMaintenanceMode, maintenanceResponse } from "../_shared/maintenance.ts";

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

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const verifyJson = await verifyRes.json().catch(() => null) as {
      status?: boolean;
      data?: { status?: string; amount?: number; metadata?: Record<string, unknown> };
    } | null;

    const paystackStatus = verifyJson?.data?.status ?? "unknown";
    const success = verifyJson?.status === true && paystackStatus === "success";

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

    if (success) {
      const meta = verifyJson?.data?.metadata ?? {};
      const metaType = typeof meta.type === "string" ? meta.type : null;
      if (metaType === "guard_tip") {
        await service.rpc("finalize_tip_from_paystack_reference", { p_reference: reference });
        await service.rpc("post_tip_settlement_hooks", { p_reference: reference });
      }
      await service.from("transactions").update({ status: "succeeded" }).eq("paystack_reference", reference);
    } else if (paystackStatus === "failed" || paystackStatus === "abandoned") {
      await service.from("tips").update({ status: "failed" }).eq("paystack_reference", reference);
      await service.from("transactions").update({ status: "failed" }).eq("paystack_reference", reference);
    }

    const { data: tipFresh } = await service
      .from("tips")
      .select("status, amount_cents")
      .eq("paystack_reference", reference)
      .maybeSingle();
    const { data: txFresh } = await service
      .from("transactions")
      .select("status, amount_cents")
      .eq("paystack_reference", reference)
      .maybeSingle();

    await service.from("payment_events").upsert(
      {
        provider: "paystack",
        provider_event_id: `verify:${reference}:${paystackStatus}`,
        event_type: "transaction.verify",
        paystack_reference: reference,
        status: success ? "processed" : paystackStatus === "failed" ? "failed" : "received",
        payload: { paystack_status: paystackStatus, verified: success },
      },
      { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
    ).catch((e) => console.error("payment_events_verify", e));

    return new Response(
      JSON.stringify({
        reference,
        paystack_status: paystackStatus,
        verified: success,
        tip_status: tipFresh?.status ?? tip?.status ?? null,
        transaction_status: txFresh?.status ?? tx?.status ?? null,
        amount_cents: tipFresh?.amount_cents ?? txFresh?.amount_cents ?? tip?.amount_cents ?? tx?.amount_cents ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
