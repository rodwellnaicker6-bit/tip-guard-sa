/**
 * Verify additive 2% platform fee on production paystack-initialize (no card charge).
 * Usage: npx tsx scripts/verify-platform-fee-live.ts
 */
import { createClient } from "@supabase/supabase-js";
import { calcAdditivePlatformFee } from "../src/lib/platformFee.js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);
const GUARD_ID = "b1000003-0003-4003-8003-000000000003";
const CASES = [
  { label: "R10", tipCents: 1000 },
  { label: "R100", tipCents: 10_000 },
  { label: "R500", tipCents: 50_000 },
];

async function main() {
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: anonData, error: anonErr } = await anon.auth.signInAnonymously();
  if (anonErr || !anonData.session) throw new Error(anonErr?.message ?? "anon failed");
  const jwt = anonData.session.access_token;

  console.log("PLATFORM FEE MODEL: additive (customer pays tip + 2%)");
  console.log("fee_bps: 200 (2%)");
  console.log("");
  console.log("| Tip | Customer Pays | Merchant Receives | TipGuard Receives |");
  console.log("|-----|---------------|-------------------|-------------------|");

  let ok = true;
  for (const c of CASES) {
    const expected = calcAdditivePlatformFee(c.tipCents, 200);
    const initRes = await fetch(`${base}/functions/v1/paystack-initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
        apikey: env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ kind: "tip", guard_id: GUARD_ID, amount_cents: c.tipCents }),
    });
    const initJson = (await initRes.json()) as {
      tip_amount_cents?: number;
      platform_fee_cents?: number;
      charge_amount_cents?: number;
      fee_model?: string;
      error?: string;
    };
    const pass =
      initRes.ok &&
      initJson.fee_model === "additive" &&
      initJson.tip_amount_cents === expected.tipAmountCents &&
      initJson.platform_fee_cents === expected.platformFeeCents &&
      initJson.charge_amount_cents === expected.chargeAmountCents;

    if (!pass) {
      ok = false;
      console.error("FAIL", c.label, initRes.status, initJson);
    }

    const cust = (expected.chargeAmountCents / 100).toFixed(2);
    const merch = (expected.tipAmountCents / 100).toFixed(2);
    const tg = (expected.platformFeeCents / 100).toFixed(2);
    console.log(`| ${c.label} | R${cust} | R${merch} | R${tg} | ${pass ? "PASS" : "FAIL"}`);
  }

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
