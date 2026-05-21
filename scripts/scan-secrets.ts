/**
 * Scan repo for leaked secrets (client bundle + tracked files).
 * Usage: npm run scan:secrets
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "playwright-report", "test-results"]);
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "service_role in client src", re: /SUPABASE_SERVICE_ROLE|VITE_.*SERVICE/i },
  { name: "Paystack secret key", re: /sk_(live|test)_[a-zA-Z0-9]{10,}/ },
  { name: "sb_secret publishable", re: /sb_secret_[a-zA-Z0-9_-]+/ },
  { name: "JWT service role shape", re: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/ },
];

let issues = 0;

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir)) {
    if (SKIP_DIRS.has(ent)) continue;
    const p = join(dir, ent);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function scanFile(path: string, scope: string) {
  if (!/\.(tsx?|jsx?|json|md|env\.example|toml|sh|yml|yaml)$/i.test(path)) return;
  if (path.includes(".env") && !path.endsWith(".env.example")) return;
  const body = readFileSync(path, "utf8");
  for (const { name, re } of PATTERNS) {
    if (scope === "src" && name === "JWT service role shape") continue;
    if (re.test(body)) {
      if (path.endsWith(".env.example") && name.includes("service")) continue;
      console.error(`✗ ${name} — ${path.replace(ROOT + "/", "")}`);
      issues += 1;
    }
  }
}

console.log("TipGuard — secret scan\n");

for (const f of walk(join(ROOT, "src"))) scanFile(f, "src");
for (const f of [".env.example", "vercel.json"]) {
  const p = join(ROOT, f);
  try {
    scanFile(p, "config");
  } catch {
    /* optional */
  }
}

if (issues === 0) {
  console.log("✓ No obvious secrets in src/ or .env.example");
  process.exit(0);
}
console.log(`\n${issues} issue(s) — rotate any exposed keys and remove from tracked files.`);
process.exit(1);
