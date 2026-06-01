/**
 * Enable Supabase anonymous sign-ins (required for guest QR tipping).
 * Requires SUPABASE_ACCESS_TOKEN in .env (Dashboard → Account → Access Tokens).
 *
 * Usage: npx tsx scripts/enable-anonymous-auth.ts
 */
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || "fyjmujhlqpvfryelnfum";

async function main() {
  if (!token) {
    console.error("Set SUPABASE_ACCESS_TOKEN in .env (see .env.example)");
    process.exit(1);
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ external_anonymous_users_enabled: true }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`Failed (${res.status}):`, body);
    process.exit(1);
  }
  console.log("✓ Anonymous sign-ins enabled for", projectRef);
}

main();
