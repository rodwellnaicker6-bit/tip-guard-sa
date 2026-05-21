/**
 * Production readiness report — runs build, lint, auth, Supabase verify, security grep.
 * Usage: npm run readiness
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const scores: { name: string; ok: boolean; note: string }[] = [];

function run(name: string, cmd: string) {
  try {
    execSync(cmd, { stdio: "pipe", cwd: process.cwd() });
    scores.push({ name, ok: true, note: "pass" });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    const msg = (err.stderr ?? err.stdout)?.toString().slice(0, 200) ?? "failed";
    scores.push({ name, ok: false, note: msg });
  }
}

console.log("TipGuard SA — production readiness\n");

run("npm run build", "npm run build");
run("npm run lint", "npm run lint");

const url = process.env.VITE_SUPABASE_URL?.trim();
const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const paystack = process.env.VITE_PAYSTACK_PUBLIC_KEY?.trim();

scores.push({
  name: "VITE_SUPABASE_URL",
  ok: Boolean(url?.includes("supabase.co")),
  note: url ?? "missing",
});
scores.push({
  name: "VITE_SUPABASE_ANON_KEY",
  ok: Boolean(anon && anon.length > 20),
  note: anon ? `${anon.slice(0, 18)}…` : "missing",
});
scores.push({
  name: "VITE_PAYSTACK_PUBLIC_KEY",
  ok: Boolean(paystack?.startsWith("pk_")),
  note: paystack ? "set" : "missing — payments blocked",
});

// Security: no service role in src bundle
const srcFiles = walk("src");
let secretLeak = false;
for (const f of srcFiles) {
  if (!/\.(tsx?|jsx?)$/.test(f)) continue;
  const body = readFileSync(f, "utf8");
  if (
    /VITE_SUPABASE_SERVICE|SUPABASE_SERVICE_ROLE_KEY|sk_live_[a-zA-Z0-9]|sk_test_[a-zA-Z0-9]|sb_secret_/i.test(
      body,
    )
  ) {
    secretLeak = true;
    scores.push({ name: `secret in ${f}`, ok: false, note: "remove service/secret keys from client src" });
  }
}
if (!secretLeak) {
  scores.push({ name: "client secret scan", ok: true, note: "no service_role in src/" });
}

try {
  execSync("npm run scan:secrets", { stdio: "pipe" });
  scores.push({ name: "scan:secrets", ok: true, note: "pass" });
} catch {
  scores.push({ name: "scan:secrets", ok: false, note: "review scripts/scan-secrets output" });
}

try {
  execSync("npm run verify:supabase", { stdio: "pipe" });
  scores.push({ name: "verify:supabase", ok: true, note: "pass" });
} catch {
  scores.push({ name: "verify:supabase", ok: false, note: "run supabase db push + seed:demo" });
}

try {
  execSync("npm run test:auth", { stdio: "pipe" });
  scores.push({ name: "test:auth", ok: true, note: "pass" });
} catch {
  scores.push({ name: "test:auth", ok: false, note: "auth rate limit or misconfig" });
}

const passed = scores.filter((s) => s.ok).length;
const total = scores.length;
const score10 = Math.round((passed / total) * 10);

console.log("Results:\n");
for (const s of scores) {
  console.log(`${s.ok ? "✓" : "✗"} ${s.name} — ${s.note}`);
}
console.log(`\nReadiness score: ${score10}/10 (${passed}/${total} checks)`);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

process.exit(score10 >= 7 ? 0 : 1);
