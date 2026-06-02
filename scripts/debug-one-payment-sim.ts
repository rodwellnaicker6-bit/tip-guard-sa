import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "PAYSTACK_SECRET_KEY",
]);
const GUARD_ID = "b1000003-0003-4003-8003-000000000003";
const base = env.SUPABASE_URL.replace(/\/$/, "");

function sign(body: string) {
  return createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
}

async function main() {
  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: anonData } = await anon.auth.signInAnonymously();
  const jwt = anonData!.session!.access_token;

  const initRes = await fetch(`${base}/functions/v1/paystack-initialize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      apikey: env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ kind: "tip", guard_id: GUARD_ID, amount_cents: 4321 }),
  });
  const initText = await initRes.text();
  console.log("init", initRes.status, initText);
  const initJson = JSON.parse(initText) as { reference?: string };
  const reference = initJson.reference;
  if (!reference) return;

  const { data: tipBefore } = await service
    .from("tips")
    .select("status, amount_cents")
    .eq("paystack_reference", reference)
    .maybeSingle();
  console.log("tip before webhook", tipBefore);

  const payload = {
    event: "charge.success",
    data: {
      id: Date.now(),
      reference,
      amount: 4321,
      status: "success",
      metadata: { type: "guard_tip", guard_id: GUARD_ID },
    },
  };
  const raw = JSON.stringify(payload);
  const whRes = await fetch(`${base}/functions/v1/paystack-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-paystack-signature": sign(raw) },
    body: raw,
  });
  console.log("webhook", whRes.status, await whRes.text());

  const { data: tipAfter } = await service
    .from("tips")
    .select("status")
    .eq("paystack_reference", reference)
    .maybeSingle();
  console.log("tip after webhook", tipAfter);

  const { error: finErr } = await service.rpc("finalize_tip_from_paystack_reference", {
    p_reference: reference,
  });
  console.log("finalize rpc", finErr?.message ?? "ok");

  const { data: tipFin } = await service
    .from("tips")
    .select("status")
    .eq("paystack_reference", reference)
    .maybeSingle();
  console.log("tip after finalize", tipFin);

  const statusRes = await fetch(`${base}/functions/v1/payment-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ reference }),
  });
  console.log("payment-status", statusRes.status, await statusRes.text());
}

main();
