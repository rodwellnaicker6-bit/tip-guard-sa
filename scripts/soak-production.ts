/**
 * Best-effort production soak: RPC latency, verify gates, bundle size.
 * Usage: npx tsx scripts/soak-production.ts
 */
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL?.trim();
const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const token = process.env.SOAK_QR_TOKEN?.trim() || "demo-staging-qr-01";
const iterations = Math.min(120, Math.max(10, Number(process.env.SOAK_ITERATIONS) || 40));

type RpcResult = { label: string; p50: number; p95: number; max: number; errors: number; n: number };

async function soakRpc(
  client: ReturnType<typeof createClient>,
  label: string,
  fn: () => Promise<{ error: unknown }>,
  n: number,
): Promise<RpcResult> {
  const times: number[] = [];
  let errors = 0;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const { error } = await fn();
    times.push(performance.now() - t0);
    if (error) errors += 1;
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)] ?? 0;
  const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
  return { label, p50, p95, max: times[times.length - 1] ?? 0, errors, n };
}

function bundleMetrics(): { mainKb: number; totalJsKb: number } {
  const dist = join(process.cwd(), "dist/assets");
  let mainKb = 0;
  let totalJsKb = 0;
  try {
    for (const name of readdirSync(dist)) {
      if (!name.endsWith(".js")) continue;
      const st = statSync(join(dist, name));
      totalJsKb += st.size / 1024;
      if (name.startsWith("index-")) mainKb = st.size / 1024;
    }
  } catch {
    /* dist missing */
  }
  return { mainKb: Math.round(mainKb * 10) / 10, totalJsKb: Math.round(totalJsKb * 10) / 10 };
}

function runGate(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: "pipe", encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const gates = {
    lint: runGate("npm run lint"),
    build: runGate("npm run build"),
    verifySupabase: runGate("npm run verify:supabase"),
    verifyPaystack: runGate("npm run verify:paystack"),
  };

  const rpcResults: RpcResult[] = [];
  if (url && anon) {
    const client = createClient(url, anon, { auth: { persistSession: false } });
    rpcResults.push(
      await soakRpc(client, "resolve_tip_target", () => client.rpc("resolve_tip_target", { p_token: token }), iterations),
    );
    rpcResults.push(
      await soakRpc(client, "list_public_guards", () => client.rpc("list_public_guards"), Math.min(20, iterations)),
    );
  }

  const bundle = bundleMetrics();
  const gateScore = Object.values(gates).filter(Boolean).length;
  const rpcScore =
    rpcResults.length === 0
      ? 0
      : rpcResults.every((r) => r.errors <= r.n * 0.05 && r.p95 < 3000)
        ? 2
        : rpcResults.every((r) => r.errors <= r.n * 0.15)
          ? 1
          : 0;
  const readinessScore = Math.min(10, gateScore * 1.5 + rpcScore * 2 + (bundle.mainKb > 0 ? 1 : 0));

  const report = {
    at: new Date().toISOString(),
    iterations,
    token,
    gates,
    rpcResults,
    bundle,
    readinessScore: Math.round(readinessScore * 10) / 10,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(gates.lint && gates.build && readinessScore >= 6 ? 0 : 1);
}

void main();
