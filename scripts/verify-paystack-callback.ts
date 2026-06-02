/**
 * Verify paystack-initialize sets callback_url on Paystack transaction.
 * Usage: npx tsx scripts/verify-paystack-callback.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv([
  "SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "PAYSTACK_SECRET_KEY",
]);
const GUARD_ID = "b1000003-0003-4003-8003-000000000003";

async function main() {
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: anonData, error } = await anon.auth.signInAnonymously();
  if (error || !anonData.session) throw new Error(error?.message ?? "anon sign-in failed");

  const jwt = anonData.session.access_token;
  const initRes = await fetch(`${base}/functions/v1/paystack-initialize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      apikey: env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ kind: "tip", guard_id: GUARD_ID, amount_cents: 1000 }),
  });
  const initJson = (await initRes.json()) as {
    reference?: string;
    callback_url?: string;
    error?: string;
  };
  console.log("init status", initRes.status);
  console.log("callback_url from edge", initJson.callback_url ?? "MISSING");
  if (!initJson.reference) {
    console.error(initJson);
    process.exit(1);
  }

  const verifyRes = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(initJson.reference)}`,
    { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } },
  );
  const verifyJson = (await verifyRes.json()) as {
    data?: { callback_url?: string | null; status?: string };
  };
  console.log("paystack callback_url", verifyJson.data?.callback_url ?? "MISSING");
  const ok =
    Boolean(initJson.callback_url?.includes("tipguardsa.co.za/payment/success")) &&
    Boolean(verifyJson.data?.callback_url?.includes("tipguardsa.co.za/payment/success"));
  console.log(ok ? "PASS callback configured" : "FAIL callback missing");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
