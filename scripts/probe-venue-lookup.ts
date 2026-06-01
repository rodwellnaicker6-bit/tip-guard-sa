/**
 * Trace venue / QR lookup on production — logs each step with timing.
 * Usage: npx tsx scripts/probe-venue-lookup.ts [qr_token] [merchant_email]
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
]);

const QR_TOKEN = process.argv[2]?.trim() || "demo-staging-qr-01";
const MERCHANT_EMAIL = process.argv[3]?.trim() || "demo-merchant@tipguard.staging";
const VENUE_TIMEOUT_MS = 12_000;

type Step = { name: string; ms: number; ok: boolean; detail: string };

function timed<T>(name: string, fn: () => Promise<T>): Promise<{ step: Step; value: T | null }> {
  const t0 = performance.now();
  return fn()
    .then((value) => ({
      value,
      step: {
        name,
        ms: Math.round(performance.now() - t0),
        ok: true,
        detail: JSON.stringify(value).slice(0, 400),
      },
    }))
    .catch((e: Error) => ({
      value: null,
      step: {
        name,
        ms: Math.round(performance.now() - t0),
        ok: false,
        detail: e.message.slice(0, 400),
      },
    }));
}

async function withTimeout<T>(label: string, ms: number, fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function main() {
  const steps: Step[] = [];
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  console.log("=== QR / NFC resolve chain (anonymous) ===");
  console.log("token:", QR_TOKEN);

  const anonSignIn = await timed("auth.signInAnonymously", async () => {
    const { data, error } = await anon.auth.signInAnonymously();
    if (error) throw error;
    return { uid: data.session?.user?.id, isAnonymous: data.session?.user?.is_anonymous };
  });
  steps.push(anonSignIn.step);
  console.log(anonSignIn.step.ok ? "OK" : "FAIL", anonSignIn.step.name, anonSignIn.step.ms + "ms", anonSignIn.step.detail);

  const resolveAnon = await timed("rpc.resolve_tip_target (anon JWT)", async () => {
    const { data, error } = await withTimeout("resolve_tip_target", VENUE_TIMEOUT_MS, () =>
      anon.rpc("resolve_tip_target", { p_token: QR_TOKEN }),
    );
    if (error) throw new Error(`${error.code}: ${error.message}`);
    return data;
  });
  steps.push(resolveAnon.step);
  console.log(resolveAnon.step.ok ? "OK" : "FAIL", resolveAnon.step.name, resolveAnon.step.ms + "ms");
  if (resolveAnon.value) console.log("  rows:", JSON.stringify(resolveAnon.value, null, 2));

  const resolveBare = await timed("rpc.resolve_tip_target (no session)", async () => {
    const bare = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await withTimeout("resolve_tip_target bare", VENUE_TIMEOUT_MS, () =>
      bare.rpc("resolve_tip_target", { p_token: QR_TOKEN }),
    );
    if (error) throw new Error(`${error.code}: ${error.message}`);
    return data;
  });
  steps.push(resolveBare.step);
  console.log(resolveBare.step.ok ? "OK" : "FAIL", resolveBare.step.name, resolveBare.step.ms + "ms");

  console.log("\n=== Admin chain (service role) ===");
  const qrRow = await timed("qr_codes by token", async () => {
    const { data, error } = await admin
      .from("qr_codes")
      .select("id,code_token,guard_id,merchant_id,location_id,qr_type,expires_at,revoked_at,scan_count")
      .eq("code_token", QR_TOKEN)
      .maybeSingle();
    if (error) throw error;
    return data;
  });
  steps.push(qrRow.step);
  console.log(qrRow.step.ok ? "OK" : "FAIL", qrRow.step.name, qrRow.step.detail);

  const qr = qrRow.value as Record<string, unknown> | null;
  if (qr?.guard_id) {
    const g = await timed("guards by qr.guard_id", async () => {
      const { data, error } = await admin
        .from("guards")
        .select("id,display_name,verified,merchant_id,location_id,user_id")
        .eq("id", qr.guard_id as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    });
    steps.push(g.step);
    console.log(g.step.ok ? "OK" : "FAIL", g.step.name, g.step.detail);

    const guard = g.value as { merchant_id?: string; location_id?: string } | null;
    if (guard?.location_id) {
      const loc = await timed("merchant_locations by guard.location_id", async () => {
        const { data, error } = await admin
          .from("merchant_locations")
          .select("id,name,merchant_id")
          .eq("id", guard.location_id!)
          .maybeSingle();
        if (error) throw error;
        return data;
      });
      steps.push(loc.step);
      console.log(loc.step.ok ? "OK" : "FAIL", loc.step.name, loc.step.detail);
    }
    if (guard?.merchant_id) {
      const m = await timed("merchants by guard.merchant_id", async () => {
        const { data, error } = await admin
          .from("merchants")
          .select("id,business_name,verified,user_id,location")
          .eq("id", guard.merchant_id!)
          .maybeSingle();
        if (error) throw error;
        return data;
      });
      steps.push(m.step);
      console.log(m.step.ok ? "OK" : "FAIL", m.step.name, m.step.detail);
    }
  }

  console.log("\n=== Merchant venue load (authenticated — matches useMerchantVenue) ===");
  const password = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";
  const merchantClient = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const login = await timed("merchant signInWithPassword", async () => {
    const { data, error } = await merchantClient.auth.signInWithPassword({
      email: MERCHANT_EMAIL,
      password,
    });
    if (error) throw error;
    return { uid: data.user?.id };
  });
  steps.push(login.step);
  const merchantUid = (login.value as { uid?: string } | null)?.uid;
  console.log(login.step.ok ? "OK" : "FAIL", login.step.name, merchantUid ?? login.step.detail);

  if (merchantUid) {
    const venueSelect = await timed("from.merchants.select eq user_id (authenticated)", async () => {
      const { data, error } = await withTimeout("merchants select", VENUE_TIMEOUT_MS + 1000, () =>
        merchantClient
          .from("merchants")
          .select("id, business_name, location, verified, risk_score")
          .eq("user_id", merchantUid)
          .abortSignal(AbortSignal.timeout(VENUE_TIMEOUT_MS))
          .maybeSingle(),
      );
      if (error) throw new Error(`${error.code}: ${error.message}`);
      return data;
    });
    steps.push(venueSelect.step);
    console.log(
      venueSelect.step.ok ? "OK" : "FAIL",
      venueSelect.step.name,
      venueSelect.step.ms + "ms",
      venueSelect.step.detail,
    );

    const venueAnonBlocked = await timed("merchants select as anonymous (RLS expect empty/deny)", async () => {
      const { data, error } = await anon
        .from("merchants")
        .select("id")
        .eq("user_id", merchantUid)
        .maybeSingle();
      return { data, error: error?.message ?? null, code: error?.code ?? null };
    });
    steps.push(venueAnonBlocked.step);
    console.log("RLS anon merchants:", venueAnonBlocked.step.detail);
  }

  console.log("\n--- Summary ---");
  const failed = steps.filter((s) => !s.ok);
  for (const s of steps) {
    console.log(`${s.ok ? "PASS" : "FAIL"}\t${s.ms}ms\t${s.name}`);
  }
  if (failed.length) {
    console.log("\nFailing step:", failed[0].name, "—", failed[0].detail);
    process.exit(1);
  }
  console.log("\nAll steps passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
