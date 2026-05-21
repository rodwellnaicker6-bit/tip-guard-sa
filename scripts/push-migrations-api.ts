/**
 * Push migrations via Supabase Management API (requires personal access token).
 * Create token: https://supabase.com/dashboard/account/tokens
 * Set SUPABASE_ACCESS_TOKEN in .env then: npm run db:push:api
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || "fyjmujhlqpvfryelnfum";

if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN in .env (Dashboard → Account → Access Tokens)");
  process.exit(1);
}

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

async function runQuery(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return text;
}

async function main() {
  console.log(`Applying ${files.length} migrations to ${projectRef}…\n`);
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`  ${file}… `);
    try {
      await runQuery(sql);
      console.log("ok");
    } catch (e) {
      console.log("FAILED");
      console.error((e as Error).message);
      process.exit(1);
    }
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
