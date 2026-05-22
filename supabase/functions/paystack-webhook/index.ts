import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkRateLimit, recordRateLimitHit } from "../_shared/rateLimit.ts";
import { isMaintenanceMode, maintenanceResponse } from "../_shared/maintenance.ts";

async function enqueueWebhookRetry(
  service: SupabaseClient,
  opts: { eventId: string | null; eventType: string | null; payload: unknown; errorMessage: string },
): Promise<void> {
  const { error } = await service.from("webhook_retry_queue").insert({
    provider: "paystack",
    event_id: opts.eventId,
    event_type: opts.eventType,
    payload: opts.payload,
    error_message: opts.errorMessage,
    status: "pending",
    next_retry_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  if (error) console.error("webhook_retry_enqueue", error);
}

const log = (msg: string, extra?: Record<string, unknown>) => {
  console.log(JSON.stringify({ msg, ts: new Date().toISOString(), ...extra }));
};

async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const a = hex.toLowerCase();
  const b = signature.toLowerCase();
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (isMaintenanceMode()) return maintenanceResponse();

  const secret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
  if (!secret) {
    return new Response("Missing PAYSTACK_SECRET_KEY", { status: 500 });
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip")?.trim() ??
    "unknown";
  const rateKey = { userId: `webhook:${clientIp}`, route: "paystack-webhook" };
  const allowed = await checkRateLimit(service, rateKey, { max: 200, windowSec: 60 });
  if (!allowed) {
    return new Response(JSON.stringify({ error: "rate_limit" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }
  await recordRateLimitHit(service, rateKey);

  const rawBody = await req.text();
  const sig = req.headers.get("x-paystack-signature");
  const ok = await verifySignature(rawBody, sig, secret);
  if (!ok) {
    log("paystack_webhook_bad_signature");
    return new Response("Invalid signature", { status: 400 });
  }

  let payload: { event?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = payload.event ?? "unknown";
  const data = payload.data ?? {};
  const dataId = data.id != null ? String(data.id) : "na";
  const dedupeId = `${event}:${dataId}`;

  let claimed: boolean;
  const { data: providerClaimed, error: providerClaimErr } = await service.rpc("claim_provider_webhook_event", {
    p_provider: "paystack",
    p_event_id: dedupeId,
    p_event_type: event,
  });
  if (!providerClaimErr && providerClaimed === true) {
    claimed = true;
  } else {
    const { data: legacyClaimed, error: claimErr } = await service.rpc("claim_paystack_webhook_event", {
      p_id: dedupeId,
      p_type: event,
    });
    if (claimErr) {
      console.error("webhook_claim", claimErr);
      await enqueueWebhookRetry(service, {
        eventId: dedupeId,
        eventType: event,
        payload,
        errorMessage: claimErr.message ?? "claim_failed",
      });
      return new Response(JSON.stringify({ error: "claim_failed" }), { status: 500 });
    }
    claimed = legacyClaimed === true;
  }

  if (!claimed) {
    log("paystack_webhook_duplicate", { dedupeId });
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const reference = typeof data.reference === "string" ? data.reference : null;

  await service
    .from("payment_events")
    .update({
      paystack_reference: reference,
      payload: payload as unknown as Record<string, unknown>,
    })
    .eq("provider", "paystack")
    .eq("provider_event_id", dedupeId);
  const metadata = (data.metadata && typeof data.metadata === "object"
    ? data.metadata as Record<string, unknown>
    : {}) as Record<string, unknown>;
  const metaType = typeof metadata.type === "string" ? metadata.type : null;
  const amount = typeof data.amount === "number" ? data.amount : null;

  if ((event === "charge.success" || event === "paymentrequest.success") && reference) {
    if (metaType === "wallet_topup") {
      const uid = typeof metadata.user_id === "string" ? metadata.user_id : null;
      if (uid && amount != null && amount > 0) {
        const { error: wErr } = await service.rpc("credit_wallet", {
          p_user_id: uid,
          p_amount_cents: amount,
        });
        if (wErr) log("credit_wallet_error", { error: wErr.message, reference });
      } else {
        log("wallet_topup_missing_fields", { reference, uid, amount });
      }
      const { error: uErr } = await service.from("transactions").update({ status: "succeeded" }).eq(
        "paystack_reference",
        reference,
      );
      if (uErr) log("transaction_update_error", { error: uErr.message, reference });
    } else if (metaType === "guard_tip") {
      const { error: fErr } = await service.rpc("finalize_tip_from_paystack_reference", {
        p_reference: reference,
      });
      if (fErr) log("finalize_tip_error", { error: fErr.message, reference });
      const { error: hookErr } = await service.rpc("post_tip_settlement_hooks", {
        p_reference: reference,
      });
      if (hookErr) log("post_tip_settlement_hooks_error", { error: hookErr.message, reference });
      const { error: uErr } = await service.from("transactions").update({ status: "succeeded" }).eq(
        "paystack_reference",
        reference,
      );
      if (uErr) log("transaction_update_error", { error: uErr.message, reference });
    }
  }

  if (
    (event === "charge.failed" || event === "subscription.not_renew" || event === "paymentrequest.failed") &&
    reference
  ) {
    const { error: tErr } = await service.from("tips").update({ status: "failed" }).eq("paystack_reference", reference);
    if (tErr) log("tip_fail_update_error", { error: tErr.message, reference });
    const { error: xErr } = await service.from("transactions").update({ status: "failed" }).eq(
      "paystack_reference",
      reference,
    );
    if (xErr) log("transaction_fail_update_error", { error: xErr.message, reference });
  }

  if (event === "subscription.create") {
    const uid = typeof metadata.user_id === "string" ? metadata.user_id : null;
    const plan = typeof metadata.plan_code === "string" ? metadata.plan_code : "unknown";
    const subObj = data.subscription as { subscription_code?: string } | undefined;
    const subCode = typeof subObj?.subscription_code === "string"
      ? subObj.subscription_code
      : typeof data.subscription_code === "string"
      ? data.subscription_code
      : null;
    if (uid) {
      const { error: sErr } = await service.from("subscriptions").upsert(
        {
          user_id: uid,
          plan_code: plan,
          paystack_subscription_code: subCode,
          status: "active",
          current_period_end: null,
        },
        { onConflict: "user_id,plan_code" },
      );
      if (sErr) log("subscription_upsert_error", { error: sErr.message, uid, plan });
    } else {
      log("subscription_create_skipped", { reference, hasUser: false });
    }
  }

  if (event.startsWith("transfer.")) {
    const transferCode = typeof data.transfer_code === "string"
      ? data.transfer_code
      : typeof data.reference === "string"
      ? data.reference
      : null;
    const transferStatus = event === "transfer.success"
      ? "paid"
      : event === "transfer.failed" || event === "transfer.reversed"
      ? "rejected"
      : "processing";

    if (transferCode) {
      const { error: pErr } = await service
        .from("payout_requests")
        .update({ status: transferStatus, updated_at: new Date().toISOString() })
        .eq("provider_reference", transferCode);
      if (pErr) log("payout_transfer_update_error", { error: pErr.message, transferCode });
    } else {
      log("transfer_event_no_code", { event });
    }
  }

  const terminalFailed = event === "charge.failed" ||
    event === "paymentrequest.failed" ||
    event === "transfer.failed" ||
    event === "transfer.reversed";

  await service
    .from("payment_events")
    .update({
      status: terminalFailed ? "failed" : "processed",
    })
    .eq("provider", "paystack")
    .eq("provider_event_id", dedupeId);

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
