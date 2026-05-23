import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, recordRateLimitHit } from "../_shared/rateLimit.ts";
import { isMaintenanceMode, maintenanceResponse } from "../_shared/maintenance.ts";
import {
  createTransferRecipient,
  initiateTransfer,
  transfersConfigured,
} from "../_shared/paystackTransfer.ts";

type PayoutBody = {
  amount_cents?: number;
  bank_code?: string;
  account_number?: string;
  account_name?: string;
};

function operatorPendingMessage(): string {
  return "Payout request recorded — funds moved to pending until operator processes transfer.";
}

function transferNotConfiguredMessage(): string {
  return "Payout request recorded. Automatic bank transfer is not configured yet; an operator will process this payout manually.";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (isMaintenanceMode()) return maintenanceResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
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
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const allowed = await checkRateLimit(service, { userId: user.id, route: "request-payout" }, {
      max: 10,
      windowSec: 300,
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Too many payout requests. Try later.", code: "rate_limit" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await recordRateLimitHit(service, { userId: user.id, route: "request-payout" });

    const { data: platform } = await service
      .from("platform_settings")
      .select("payouts_frozen")
      .eq("id", 1)
      .maybeSingle();
    if (platform?.payouts_frozen === true) {
      return new Response(
        JSON.stringify({ error: "Payouts are temporarily frozen. Try again later.", code: "payouts_frozen" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => null) as PayoutBody | null;
    const amountCents = body?.amount_cents;
    if (typeof amountCents !== "number" || amountCents < 100) {
      return new Response(JSON.stringify({ error: "amount_cents required (min 100)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: guard, error: gErr } = await supabase
      .from("guards")
      .select(
        "id, balance_cents, paystack_recipient_code, payout_bank_code, payout_account_number, payout_account_name, display_name",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (gErr || !guard?.id) {
      return new Response(JSON.stringify({ error: "Guard profile required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: wallet } = await supabase
      .from("wallet_accounts")
      .select("available_cents")
      .eq("guard_id", guard.id)
      .maybeSingle();

    const available = (wallet?.available_cents as number | undefined) ?? (guard.balance_cents ?? 0);
    if (amountCents > available) {
      return new Response(JSON.stringify({ error: "Amount exceeds available balance" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: held, error: holdErr } = await service.rpc("hold_guard_payout", {
      p_guard_id: guard.id,
      p_amount_cents: amountCents,
    });
    if (holdErr || held !== true) {
      return new Response(JSON.stringify({ error: "Could not reserve balance for payout" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: inserted, error: insErr } = await supabase
      .from("payout_requests")
      .insert({
        user_id: user.id,
        guard_id: guard.id,
        amount_cents: amountCents,
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (insErr || !inserted?.id) {
      console.error(insErr);
      const { error: rollbackErr } = await service.rpc("reverse_guard_payout_hold", {
        p_guard_id: guard.id,
        p_amount_cents: amountCents,
      });
      if (rollbackErr) console.error("payout_hold_rollback_failed", rollbackErr);
      return new Response(JSON.stringify({ error: "Could not record payout request" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payoutId = inserted.id as string;
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY")?.trim() ?? "";
    const transfersEnabled = Deno.env.get("PAYSTACK_PAYOUT_TRANSFERS")?.trim() !== "false";

    let transferInitiated = false;
    let transferCode: string | null = null;
    let message = operatorPendingMessage();

    if (!transfersConfigured(paystackSecret) || !transfersEnabled) {
      message = transferNotConfiguredMessage();
    } else {
      let recipientCode = (guard.paystack_recipient_code as string | null)?.trim() || null;
      const bankCode = (body?.bank_code ?? guard.payout_bank_code as string | null)?.trim();
      const accountNumber = (body?.account_number ?? guard.payout_account_number as string | null)?.trim();
      const accountName = (body?.account_name ?? guard.payout_account_name as string | null)?.trim() ??
        (guard.display_name as string);

      if (!recipientCode && bankCode && accountNumber && accountName) {
        const created = await createTransferRecipient(paystackSecret, {
          name: accountName,
          account_number: accountNumber,
          bank_code: bankCode,
        });
        if (created.ok) {
          recipientCode = created.data.recipient_code;
          await service.from("guards").update({
            paystack_recipient_code: recipientCode,
            payout_bank_code: bankCode,
            payout_account_number: accountNumber,
            payout_account_name: accountName,
          }).eq("id", guard.id);
        } else {
          console.error("paystack_recipient_create", created.message);
          message =
            `Payout request recorded. Automatic transfer could not start (${created.message}). An operator will process manually.`;
        }
      }

      if (recipientCode) {
        const ref = `tg_payout_${payoutId.replace(/-/g, "").slice(0, 24)}`;
        const xfer = await initiateTransfer(paystackSecret, {
          recipientCode,
          amountCents,
          reason: "TipGuard guard payout",
          reference: ref,
        });
        if (xfer.ok) {
          transferInitiated = true;
          transferCode = xfer.data.transfer_code;
          await service.from("payout_requests").update({
            status: "processing",
            provider_reference: transferCode,
            updated_at: new Date().toISOString(),
          }).eq("id", payoutId);
          message = "Payout submitted to Paystack — you will receive funds once the transfer completes.";
        } else {
          console.error("paystack_transfer_init", xfer.message);
          message =
            `Payout request recorded. Paystack transfer could not start (${xfer.message}). An operator will process manually.`;
        }
      } else if (message === operatorPendingMessage()) {
        message =
          "Payout request recorded. Add bank details on your profile or contact support for automatic transfers; otherwise an operator will process manually.";
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        id: payoutId,
        transfer_initiated: transferInitiated,
        provider_reference: transferCode,
        message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
