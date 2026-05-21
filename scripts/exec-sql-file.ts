/**
 * Execute a single SQL file via DATABASE_URL (Dashboard → Database → URI).
 * Usage: npx tsx scripts/exec-sql-file.ts supabase/migrations/20260624130000_missing_payment_qr_rpcs.sql
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();
const file = process.argv[2];
const url = process.env.DATABASE_URL?.trim();
if (!file || !url) {
  console.error("Usage: DATABASE_URL=... npx tsx scripts/exec-sql-file.ts <path.sql>");
  process.exit(1);
}
async function main() {
  const sql = readFileSync(file, "utf8");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log(`Applied ${file}`);
}
void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
