import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const c = createClient(url, key, { auth: { persistSession: false } });

const tables = [
  "merchants",
  "profiles",
  "guards",
  "qr_codes",
  "tips",
  "transactions",
  "payment_events",
];

for (const t of tables) {
  const { data, error, count, status } = await c.from(t).select("id", { count: "exact" }).limit(1);
  console.log(t, { status, count, rows: data?.length, error: error?.code, msg: error?.message?.slice(0, 50) });
}
