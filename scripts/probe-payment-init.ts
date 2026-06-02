/**
 * Probe production paystack-initialize auth: anonymous session + invoke headers.
 * Usage: npx tsx scripts/probe-payment-init.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_ANON_KEY"]);

const GUARD_ID = "b1000003-0003-4003-8003-000000000003";

async function main() {
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const url = `${base}/functions/v1/paystack-initialize`;

  console.log("=== 1. No headers (gateway probe) ===");
  const bare = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "tip", guard_id: GUARD_ID, amount_cents: 2000 }),
  });
  console.log("status:", bare.status, "body:", (await bare.text()).slice(0, 120));

  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  console.log("\n=== 2. Anonymous sign-in ===");
  let jwt: string;
  let uid: string;
  const { data: anonData, error: anonErr } = await anon.auth.signInAnonymously();
  if (anonErr) {
    console.log("FAIL anonymous disabled:", anonErr.message);
    console.log("Run: npx tsx scripts/enable-anonymous-auth.ts");
    console.log("\n=== 2b. Demo customer password sign-in (fallback) ===");
    const password = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";
    const { data: cust, error: custErr } = await anon.auth.signInWithPassword({
      email: "demo-customer@tipguard.staging",
      password,
    });
    if (custErr || !cust.session) {
      console.log("FAIL:", custErr?.message ?? "no session");
      process.exit(1);
    }
    jwt = cust.session.access_token;
    uid = cust.session.user.id;
    console.log("OK demo-customer uid:", uid);
  } else {
    jwt = anonData.session!.access_token;
    uid = anonData.session!.user.id;
    console.log("OK anonymous uid:", uid);
  }

  console.log("\n=== 3. Invoke with Authorization + apikey ===");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt}`,
    apikey: env.VITE_SUPABASE_ANON_KEY,
  };
  console.log("POST", url);
  console.log("headers:", { ...headers, Authorization: "Bearer [jwt]", apikey: "[anon]" });
  const amountCents = 2000 + (Date.now() % 97);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      kind: "tip",
      guard_id: GUARD_ID,
      amount_cents: amountCents,
    }),
  });
  const body = await res.text();
  console.log("status:", res.status);
  console.log("body:", body.slice(0, 400));

  console.log("\n=== 4. supabase-js functions.invoke ===");
  const { data, error } = await anon.functions.invoke("paystack-initialize", {
    body: { kind: "tip", guard_id: GUARD_ID, amount_cents: amountCents + 1 },
    headers: { Authorization: `Bearer ${jwt}`, apikey: env.VITE_SUPABASE_ANON_KEY },
  });
  console.log("error:", error?.message ?? null);
  console.log("data:", JSON.stringify(data)?.slice(0, 200) ?? null);

  const anonOk = !anonErr;
  process.exit(anonOk && res.ok && !error ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
