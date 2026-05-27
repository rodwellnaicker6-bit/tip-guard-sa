/**
 * NFC / QR resolve benchmark — cold vs warm RPC timings.
 * Usage: npx tsx scripts/benchmark-nfc-resolve.ts [token] [iterations]
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL?.trim();
const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const token = process.argv[2]?.trim() || "demo-staging-qr-01";
const iterations = Math.min(100, Math.max(5, Number(process.argv[3]) || 45));

if (!url || !anon) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

const client = createClient(url, anon, { auth: { persistSession: false } });

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

async function rpcOnce(): Promise<{ ms: number; ok: boolean }> {
  const t0 = performance.now();
  const { data, error } = await client.rpc("resolve_tip_target", { p_token: token });
  const ms = performance.now() - t0;
  const ok = !error && data && (!Array.isArray(data) || data.length > 0);
  return { ms, ok };
}

async function main() {
  const times: number[] = [];
  let errors = 0;

  for (let i = 0; i < iterations; i++) {
    const { ms, ok } = await rpcOnce();
    times.push(ms);
    if (!ok) errors += 1;
  }

  times.sort((a, b) => a - b);
  const cold = times[0] ?? 0;
  const warm = times.slice(1);
  const warmSorted = [...warm].sort((a, b) => a - b);

  const summary = {
    token,
    iterations,
    errors,
    coldMs: Math.round(cold * 10) / 10,
    warm: {
      count: warm.length,
      p50: Math.round(percentile(warmSorted, 0.5) * 10) / 10,
      p95: Math.round(percentile(warmSorted, 0.95) * 10) / 10,
      max: Math.round((warmSorted[warmSorted.length - 1] ?? 0) * 10) / 10,
    },
    all: {
      p50: Math.round(percentile(times, 0.5) * 10) / 10,
      p95: Math.round(percentile(times, 0.95) * 10) / 10,
    },
    nfcWarmTargetMs: 2000,
    passWarmUnder2s: percentile(warmSorted, 0.95) < 2000,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(errors > iterations * 0.1 || !summary.passWarmUnder2s ? 1 : 0);
}

void main();
