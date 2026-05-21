/**
 * Configure Supabase Auth redirect URLs via Management API.
 * Requires SUPABASE_ACCESS_TOKEN in .env
 */
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || "fyjmujhlqpvfryelnfum";
const siteUrl = process.env.AUTH_SITE_URL?.trim() || "http://localhost:5173";

const redirectUrls = [
  "http://localhost:5173",
  "http://localhost:5173/",
  "http://localhost:5173/auth/callback",
  "http://localhost:5173/auth/reset",
  "http://localhost:5174",
  "http://localhost:5174/",
  "http://localhost:5174/auth/callback",
  "http://localhost:5174/auth/reset",
];

async function main() {
  if (!token) {
    console.error("Set SUPABASE_ACCESS_TOKEN in .env");
    process.exit(1);
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      site_url: siteUrl,
      uri_allow_list: redirectUrls.join(","),
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`Failed (${res.status}):`, body);
    process.exit(1);
  }
  console.log("✓ Auth URLs configured:");
  console.log(`  Site URL: ${siteUrl}`);
  for (const u of redirectUrls) console.log(`  Redirect: ${u}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
