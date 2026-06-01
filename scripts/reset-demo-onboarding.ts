/**
 * Repair demo account profiles for onboarding (no full seed wipe).
 * Fixes demo-customer when role/merchant rows were corrupted by failed onboarding tests.
 *
 * Usage: npx tsx scripts/reset-demo-onboarding.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";
import { DEMO_IDS } from "./demo-ids.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PROFILE_FIXES = [
  { id: DEMO_IDS.customer, role: "customer", name: "Demo Customer" },
  { id: DEMO_IDS.merchant, role: "merchant", name: "Demo Merchant" },
  { id: DEMO_IDS.guard, role: "guard", name: "Demo Guard" },
] as const;

async function main() {
  console.log("TipGuard — reset demo onboarding state\n");

  const { data: strayMerchants, error: mListErr } = await admin
    .from("merchants")
    .select("id, user_id, business_name")
    .eq("user_id", DEMO_IDS.customer);
  if (mListErr) throw new Error(`list merchants: ${mListErr.message}`);
  if (strayMerchants?.length) {
    const ids = strayMerchants.map((r) => r.id);
    const { error } = await admin.from("merchants").delete().in("id", ids);
    if (error) throw new Error(`delete stray customer merchants: ${error.message}`);
    console.log(`  - removed ${ids.length} merchant row(s) wrongly linked to demo-customer`);
  }

  const { data: strayGuards, error: gListErr } = await admin
    .from("guards")
    .select("id, user_id, display_name")
    .eq("user_id", DEMO_IDS.customer);
  if (gListErr) throw new Error(`list guards: ${gListErr.message}`);
  if (strayGuards?.length) {
    const ids = strayGuards.map((r) => r.id);
    const { error } = await admin.from("guards").delete().in("id", ids);
    if (error) throw new Error(`delete stray customer guards: ${error.message}`);
    console.log(`  - removed ${ids.length} guard row(s) wrongly linked to demo-customer`);
  }

  for (const p of PROFILE_FIXES) {
    const { error } = await admin.from("profiles").upsert(
      { id: p.id, role: p.role, full_name: p.name, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
    if (error) throw new Error(`profile ${p.id}: ${error.message}`);
    console.log(`  ✓ profile ${p.role} ← ${p.id}`);
  }

  const { data: customer } = await admin
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", DEMO_IDS.customer)
    .maybeSingle();
  console.log("\nDemo customer after reset:", customer);
  console.log("\n✓ Run onboarding at https://tipguardsa.co.za/onboarding as demo-customer@tipguard.staging");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
