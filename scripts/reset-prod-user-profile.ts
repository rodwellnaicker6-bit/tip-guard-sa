/**
 * Service-role reset of a single profiles row (role + name).
 * Usage: npx tsx scripts/reset-prod-user-profile.ts <uid> <role> [full_name]
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
const uid = process.argv[2]?.trim();
const role = process.argv[3]?.trim() ?? "customer";
const fullName = process.argv[4]?.trim();

if (!uid) {
  console.error("Usage: npx tsx scripts/reset-prod-user-profile.ts <uid> <role> [full_name]");
  process.exit(1);
}

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const patch: Record<string, string> = { role };
if (fullName) patch.full_name = fullName;

const { data, error } = await admin.from("profiles").update(patch).eq("id", uid).select().maybeSingle();
if (error) {
  console.error(error.code, error.message);
  process.exit(1);
}
console.log("OK", data);
