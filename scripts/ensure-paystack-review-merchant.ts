/**
 * Reset paystack-review@tipguard.staging so /merchant/setup wizard is capturable for submission evidence.
 * Usage: npx tsx scripts/ensure-paystack-review-merchant.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

const REVIEW_EMAIL = process.env.PAYSTACK_REVIEW_MERCHANT_EMAIL?.trim() || "paystack-review@tipguard.staging";
const REVIEW_PASSWORD = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  let userId = list?.users?.find((u) => u.email === REVIEW_EMAIL)?.id;

  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: REVIEW_EMAIL,
      password: REVIEW_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = created.user.id;
    console.log("Created", REVIEW_EMAIL);
  }

  await admin.from("profiles").upsert(
    {
      id: userId,
      role: "merchant",
      full_name: "Paystack Review Venue",
      phone: "+27108804590",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  const { data: merchants } = await admin.from("merchants").select("id").eq("user_id", userId);
  if (merchants?.length) {
    const ids = merchants.map((m) => m.id);
    await admin.from("kyc_cases").delete().in("party_id", ids).eq("party_type", "merchant");
    await admin.from("qr_codes").delete().in("merchant_id", ids);
    await admin.from("merchant_locations").delete().in("merchant_id", ids);
    const { error } = await admin.from("merchants").delete().in("id", ids);
    if (error) throw error;
    console.log("Removed merchant rows for review account — setup wizard will show.");
  }

  console.log("OK", REVIEW_EMAIL, "ready for /merchant/setup capture");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
