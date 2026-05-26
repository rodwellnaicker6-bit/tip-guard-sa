import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL?.trim();
const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !sk) {
  console.error("Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, sk, { auth: { persistSession: false } });

async function trySelect(cols: string) {
  const { data, error } = await admin.from("merchants").select(cols).limit(1);
  if (error) console.log("FAIL", cols, error.code, error.message);
  else console.log("OK", cols, "rows", data?.length ?? 0);
}

async function main() {
  await trySelect("id, business_name, location, verified, risk_score");
  await trySelect("id, business_name, location, verified");
  await trySelect("id");
}

void main();
