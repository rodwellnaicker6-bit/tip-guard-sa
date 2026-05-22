import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, recordRateLimitHit } from "../_shared/rateLimit.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    const body = await req.json().catch(() => null) as { amount_cents?: number } | null;
    const amountCents = body?.amount_cents;
    if (typeof amountCents !== "number" || amountCents < 100) {
      return new Response(JSON.stringify({ error: "amount_cents required (min 100)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: guard, error: gErr } = await supabase
      .from("guards")
      .select("id, balance_cents")
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

    if (insErr) {
      console.error(insErr);
      return new Response(JSON.stringify({ error: "Could not record payout request" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        id: inserted?.id,
        message: "Payout request recorded — funds moved to pending until operator processes transfer.",
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
