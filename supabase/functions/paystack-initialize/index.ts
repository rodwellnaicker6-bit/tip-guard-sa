import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, recordRateLimitHit } from "../_shared/rateLimit.ts";
import { isMaintenanceMode, maintenanceResponse } from "../_shared/maintenance.ts";
import { runFraudChecks } from "../_shared/fraudCheck.ts";

const RATE_MAX = 30;
const RATE_WINDOW_SEC = 60;

function randomRef(prefix: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return prefix + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type InitBody = {
  kind?: "tip" | "wallet_topup" | "subscription";
  guard_id?: string;
  amount_cents?: number;
  plan_code?: string;
  channels?: string[];
  device_fingerprint?: string;
  qr_code_id?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (isMaintenanceMode()) return maintenanceResponse();

  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
    if (!secret) {
      return new Response(JSON.stringify({ error: "PAYSTACK_SECRET_KEY not configured", code: "config" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization", code: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid session", code: "invalid_session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const allowed = await checkRateLimit(service, { userId: user.id, route: "paystack-initialize" }, {
      max: RATE_MAX,
      windowSec: RATE_WINDOW_SEC,
    });
    if (!allowed) {
      await service.from("fraud_events").insert({
        user_id: user.id,
        kind: "rate_limit",
        detail: { route: "paystack-initialize" },
      }).catch(() => undefined);
      return new Response(JSON.stringify({ error: "Too many payment attempts. Try again shortly.", code: "rate_limit" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await recordRateLimitHit(service, { userId: user.id, route: "paystack-initialize" });

    const body = await req.json().catch(() => null) as InitBody | null;
    const kind = body?.kind;
    const amountCents = body?.amount_cents;
    const guardId = body?.guard_id;
    const deviceHash = typeof body?.device_fingerprint === "string"
      ? body.device_fingerprint.slice(0, 64)
      : null;
    const qrCodeId = typeof body?.qr_code_id === "string" ? body.qr_code_id : null;
    const channels = Array.isArray(body?.channels) && body!.channels!.length > 0
      ? body!.channels!
      : ["card", "bank", "apple_pay"];

    if (kind === "subscription") {
      return new Response(
        JSON.stringify({
          error: "Subscriptions are not enabled in checkout yet. Create plans in Paystack and use paystack-create-plan for codes.",
          code: "subscription_stub",
        }),
        { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (kind !== "tip" && kind !== "wallet_topup") {
      return new Response(JSON.stringify({ error: "kind must be tip or wallet_topup", code: "validation" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof amountCents !== "number" || amountCents < 100 || amountCents > 5_000_000) {
      return new Response(JSON.stringify({ error: "amount_cents out of allowed range", code: "amount_range" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = user.email ?? `${user.id}@customers.tipguard.local`;
    const reference = randomRef(kind === "tip" ? "tg_" : "wl_");
    const paystackTest = secret.startsWith("sk_test_");

    const fraud = await runFraudChecks(service, {
      userId: user.id,
      amountCents,
      reference,
      route: "paystack-initialize",
    });
    if (fraud.blocked) {
      return new Response(
        JSON.stringify({ error: "Payment blocked by fraud policy", code: "fraud_blocked", rules: fraud.triggered }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const metadata: Record<string, string> = {
      user_id: user.id,
      type: kind === "tip" ? "guard_tip" : "wallet_topup",
      app: "tipguard-sa",
      paystack_test: paystackTest ? "true" : "false",
    };

    let transactionId: string | null = null;

    if (kind === "tip") {
      if (!guardId) {
        return new Response(JSON.stringify({ error: "guard_id required for tips", code: "validation" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: guard, error: gErr } = await service
        .from("guards")
        .select("id, display_name, verified")
        .eq("id", guardId)
        .maybeSingle();

      if (gErr || !guard?.id) {
        return new Response(JSON.stringify({ error: "Guard not found", code: "guard_not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!guard.verified) {
        return new Response(JSON.stringify({ error: "Guard is not verified for payments", code: "guard_unverified" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      metadata.guard_id = guard.id;
      metadata.guard_display_name = String(guard.display_name ?? "").slice(0, 120);

      const { data: feeRow } = await service.rpc("get_platform_fee_bps");
      const feeBps = typeof feeRow === "number" ? feeRow : 250;
      const commissionCents = Math.max(0, Math.round((amountCents * feeBps) / 10000));
      const netCents = amountCents - commissionCents;

      const { error: tipErr } = await service.from("tips").insert({
        guard_id: guard.id,
        payer_id: user.id,
        amount_cents: amountCents,
        commission_cents: commissionCents,
        net_amount_cents: netCents,
        payer_device_hash: deviceHash,
        qr_code_id: qrCodeId,
        paystack_reference: reference,
        status: "pending",
      });

      if (tipErr) {
        console.error(tipErr);
        return new Response(JSON.stringify({ error: "Could not create tip record", code: "tip_insert_failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: txRow, error: txErr } = await service.from("transactions").insert({
        user_id: user.id,
        type: "tip",
        amount_cents: amountCents,
        commission_cents: commissionCents,
        payer_device_hash: deviceHash,
        guard_id: guard.id,
        currency: "ZAR",
        status: "pending",
        paystack_reference: reference,
        metadata: {
          guard_id: guard.id,
          guard_display_name: metadata.guard_display_name,
          fee_bps: feeBps,
          device_fingerprint: deviceHash,
        },
      }).select("id").maybeSingle();

      if (txErr) {
        console.error(txErr);
        await service.from("tips").delete().eq("paystack_reference", reference);
        return new Response(JSON.stringify({ error: "Could not create transaction record", code: "tx_insert_failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      transactionId = (txRow as { id?: string } | null)?.id ?? null;
    } else {
      const { data: txRow, error: txErr } = await service.from("transactions").insert({
        user_id: user.id,
        type: "wallet_topup",
        amount_cents: amountCents,
        currency: "ZAR",
        status: "pending",
        paystack_reference: reference,
        metadata: { device_fingerprint: deviceHash },
        payer_device_hash: deviceHash,
      }).select("id").maybeSingle();

      if (txErr) {
        console.error(txErr);
        return new Response(JSON.stringify({ error: "Could not create transaction record", code: "tx_insert_failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      transactionId = (txRow as { id?: string } | null)?.id ?? null;
    }

    const paystackBody: Record<string, unknown> = {
      email,
      amount: amountCents,
      currency: "ZAR",
      reference,
      metadata,
      channels,
    };

    const callbackBase = Deno.env.get("PUBLIC_APP_URL")?.replace(/\/$/, "") ?? "";
    if (callbackBase) {
      paystackBody.callback_url = `${callbackBase}/payment/success?ref=${encodeURIComponent(reference)}`;
    }

    const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paystackBody),
    });

    const initJson = await initRes.json().catch(() => null) as {
      status?: boolean;
      message?: string;
      data?: { access_code?: string; authorization_url?: string; reference?: string };
    } | null;

    if (!initRes.ok || !initJson?.status || !initJson.data?.access_code) {
      console.error("paystack_init_failed", initRes.status, initJson);
      if (kind === "tip") {
        await service.from("tips").delete().eq("paystack_reference", reference);
      }
      await service.from("transactions").delete().eq("paystack_reference", reference);
      return new Response(
        JSON.stringify({
          error: initJson?.message ?? "Paystack initialize failed",
          code: "paystack_init",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessCode = initJson.data.access_code;

    if (kind === "tip") {
      await service.from("tips").update({ paystack_access_code: accessCode }).eq("paystack_reference", reference);
    }

    await service.from("payment_events").upsert(
      {
        provider: "paystack",
        provider_event_id: `init:${reference}`,
        event_type: "transaction.initialize",
        paystack_reference: reference,
        transaction_id: transactionId,
        status: "received",
        payload: { kind, amount_cents: amountCents, device_fingerprint: deviceHash, user_id: user.id },
      },
      { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
    ).catch((e) => console.error("payment_events_init", e));

    return new Response(
      JSON.stringify({
        access_code: accessCode,
        authorization_url: initJson.data.authorization_url,
        reference: initJson.data.reference ?? reference,
        email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Server error", code: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
