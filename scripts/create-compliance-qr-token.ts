/**
 * Create a fresh guard_staff QR for compliance recordings.
 * Usage: npx tsx scripts/create-compliance-qr-token.ts
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

const GUARD_ID = "b1000003-0003-4003-8003-000000000003";

async function main() {
  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: guard } = await service
    .from("guards")
    .select("id, merchant_id")
    .eq("id", GUARD_ID)
    .maybeSingle();
  if (!guard?.id) throw new Error("Demo guard not found");

  const token = `tg_${randomBytes(16).toString("hex")}`;
  const label = `compliance-vid-${Date.now().toString(36).slice(-6)}`;
  const { error } = await service.from("qr_codes").insert({
    code_token: token,
    guard_id: guard.id,
    merchant_id: guard.merchant_id,
    label,
    qr_type: "guard_staff",
  });
  if (error) throw new Error(error.message);
  console.log(token);
}

main();
