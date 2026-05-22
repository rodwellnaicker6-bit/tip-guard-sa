/**
 * Payment notification scaffold — does not send email/push in production until configured.
 * Set RESEND_API_KEY + NOTIFY_FROM_EMAIL in Supabase secrets to enable Resend later.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const fromEmail = Deno.env.get("NOTIFY_FROM_EMAIL")?.trim();
  const body = await req.json().catch(() => null) as {
    reference?: string;
    user_id?: string;
    event?: string;
  } | null;

  const reference = body?.reference?.trim();
  if (!reference) {
    return new Response(JSON.stringify({ error: "reference required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!resendKey || !fromEmail) {
    return new Response(
      JSON.stringify({
        ok: true,
        sent: false,
        reason: "notifications_disabled",
        message: "Configure RESEND_API_KEY and NOTIFY_FROM_EMAIL in Supabase secrets to enable email.",
        reference,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: tx } = await service
    .from("transactions")
    .select("user_id, amount_cents, status, type")
    .eq("paystack_reference", reference)
    .maybeSingle();

  const uid = body?.user_id ?? (tx?.user_id as string | undefined);
  if (!uid) {
    return new Response(JSON.stringify({ error: "user not found for reference" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: profile } = await service.from("profiles").select("full_name").eq("id", uid).maybeSingle();
  const { data: { user } } = await service.auth.admin.getUserById(uid);
  const to = user?.email;
  if (!to) {
    return new Response(JSON.stringify({ error: "no email for user" }), {
      status: 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventLabel = body?.event ?? "payment_update";
  const amountRands = tx?.amount_cents != null ? (Number(tx.amount_cents) / 100).toFixed(2) : "—";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject: `TipGuard — ${eventLabel}`,
      text: `Hi ${profile?.full_name ?? "there"},\n\nYour TipGuard payment (${reference}) is ${tx?.status ?? "updated"}. Amount: R${amountRands}.\n\n— TipGuard SA`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("notify_payment_resend", res.status, detail);
    return new Response(JSON.stringify({ error: "email_send_failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, sent: true, reference }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
