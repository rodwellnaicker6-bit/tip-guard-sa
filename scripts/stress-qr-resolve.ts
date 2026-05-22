/**
 * Stress-test resolve_tip_target RPC (staging / pre-launch).
 * Usage: npx tsx scripts/stress-qr-resolve.ts [token] [iterations]
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/env.js";

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL?.trim();
const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const token = process.argv[2]?.trim() || "demo-staging-qr-01";
const iterations = Math.min(500, Math.max(1, Number(process.argv[3]) || 50));

if (!url || !anon) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

const client = createClient(url, anon, { auth: { persistSession: false } });

async function main() {
  const times: number[] = [];
  let errors = 0;

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const { data, error } = await client.rpc("resolve_tip_target", { p_token: token });
    const ms = performance.now() - t0;
    times.push(ms);
    if (error || !data || (Array.isArray(data) && data.length === 0)) errors += 1;
  }

  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)] ?? 0;
  const p95 = times[Math.floor(times.length * 0.95)] ?? 0;

  console.log(`Token: ${token}`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Errors: ${errors}`);
  console.log(`p50: ${p50.toFixed(1)}ms  p95: ${p95.toFixed(1)}ms  max: ${times[times.length - 1]?.toFixed(1)}ms`);
  process.exit(errors > iterations * 0.1 ? 1 : 0);
}

void main();
