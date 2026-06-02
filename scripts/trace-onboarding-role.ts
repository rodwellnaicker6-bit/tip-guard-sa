/**
 * Trace save_onboarding_role + profiles mutations for a signed-in user.
 * Usage:
 *   npx tsx scripts/trace-onboarding-role.ts demo-merchant@tipguard.staging guard
 *   npx tsx scripts/trace-onboarding-role.ts demo-customer@tipguard.staging merchant
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);
const password = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";

const email = process.argv[2]?.trim();
const targetRole = (process.argv[3]?.trim() ?? "merchant") as "guard" | "merchant" | "customer";

if (!email) {
  console.error("Usage: npx tsx scripts/trace-onboarding-role.ts <email> [guard|merchant|customer]");
  process.exit(1);
}

const client = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function logMutation(label: string, detail: Record<string, unknown>) {
  console.log(`\n[ONBOARDING-MUTATION] ${label}`);
  for (const [k, v] of Object.entries(detail)) {
    console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  }
}

async function timed<T>(label: string, table: string, payload: Record<string, unknown>, run: () => Promise<T>) {
  const t0 = performance.now();
  try {
    const result = await run();
    const err = (result as { error?: { message?: string; code?: string; status?: number } | null }).error;
    logMutation(label, {
      operation: label,
      table,
      payload,
      durationMs: Math.round(performance.now() - t0),
      errorCode: err?.code ?? null,
      errorMessage: err?.message ?? null,
      httpStatus: (err as { status?: number })?.status ?? null,
      data: (result as { data?: unknown }).data ?? null,
    });
    return result;
  } catch (e) {
    logMutation(`${label} (throw)`, {
      operation: label,
      table,
      payload,
      durationMs: Math.round(performance.now() - t0),
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

async function main() {
  const { data: signIn, error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr || !signIn.session?.user?.id) {
    console.error("signIn failed", signErr?.message);
    process.exit(1);
  }
  const uid = signIn.session.user.id;
  console.log("Signed in", { email, uid });

  const { data: before } = await client.from("profiles").select("id, role, full_name").eq("id", uid).maybeSingle();
  console.log("Profile before:", before);
  const { data: guardRow } = await client.from("guards").select("id").eq("user_id", uid).maybeSingle();
  const { data: merchRow } = await client.from("merchants").select("id").eq("user_id", uid).maybeSingle();
  console.log("Rows:", { hasGuard: !!guardRow?.id, hasMerchant: !!merchRow?.id });

  await timed(
    "rpc.save_onboarding_role",
    "rpc",
    { p_role: targetRole },
    () => client.rpc("save_onboarding_role", { p_role: targetRole }),
  );

  const { data: after } = await client.from("profiles").select("id, role, full_name").eq("id", uid).maybeSingle();
  console.log("Profile after:", after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
