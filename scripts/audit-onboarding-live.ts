/**
 * Dev auditor: mirror Onboarding.tsx continueFromRole mutations for each demo account.
 */
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";
function unwrapRpcSingle<T>(data: unknown): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    const first = data[0];
    return first != null ? (first as T) : null;
  }
  return data as T;
}

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);
const password = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";

const emails = [
  "demo-customer@tipguard.staging",
  "demo-merchant@tipguard.staging",
  "demo-guard@tipguard.staging",
];
const intents = ["merchant", "guard"] as const;

function logMutation(label: string, detail: Record<string, unknown>) {
  console.log(`\n[ONBOARDING-MUTATION] ${label}`);
  for (const [k, v] of Object.entries(detail)) {
    console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  }
}

function errFields(err: PostgrestError | null) {
  if (!err) return { errorCode: null, errorMessage: null, httpStatus: null };
  return {
    errorCode: err.code ?? null,
    errorMessage: err.message ?? null,
    httpStatus: (err as PostgrestError & { status?: number }).status ?? null,
  };
}

async function timed<T extends { data?: unknown; error?: PostgrestError | null }>(
  label: string,
  table: string,
  payload: Record<string, unknown>,
  run: () => Promise<T>,
) {
  const t0 = performance.now();
  const result = await run();
  logMutation(label, {
    operation: label,
    table,
    payload,
    durationMs: Math.round(performance.now() - t0),
    ...errFields(result.error ?? null),
    data: result.data ?? null,
  });
  return result;
}

async function continueFromRole(
  client: ReturnType<typeof createClient>,
  uid: string,
  intent: "merchant" | "guard",
) {
  const { data: savedRoleRaw, error: rpcErr } = await timed(
    "rpc.save_onboarding_role",
    "rpc",
    { p_role: intent },
    () => client.rpc("save_onboarding_role", { p_role: intent }),
  );

  let roleSaved = unwrapRpcSingle<string>(savedRoleRaw);

  if (rpcErr) {
    const { data: row, error: updErr } = await timed(
      "profiles.update.role",
      "profiles",
      { role: intent, id: uid },
      () =>
        client.from("profiles").update({ role: intent }).eq("id", uid).select("role").maybeSingle(),
    );
    if (updErr) {
      return { ok: false, stage: "profiles.update.role", rpcErr, updErr };
    }
    roleSaved = row?.role ?? null;
    if (!roleSaved) {
      const { error: insErr } = await timed(
        "profiles.insert",
        "profiles",
        { id: uid, role: "customer" },
        () =>
          client.from("profiles").insert({
            id: uid,
            role: "customer",
            full_name: "Member",
          }),
      );
      if (insErr) {
        return { ok: false, stage: "profiles.insert", rpcErr, insErr };
      }
      const retry = await timed(
        "profiles.update.role.retry",
        "profiles",
        { role: intent, id: uid },
        () =>
          client.from("profiles").update({ role: intent }).eq("id", uid).select("role").maybeSingle(),
      );
      if (retry.error) {
        return { ok: false, stage: "profiles.update.role.retry", rpcErr, updErr: retry.error };
      }
      roleSaved = retry.data?.role ?? null;
    }
  }

  if (!roleSaved) roleSaved = intent;
  const persistedRole = roleSaved ?? intent;
  if (persistedRole !== intent) {
    return { ok: false, stage: "persist_check", expected: intent, got: persistedRole };
  }
  return { ok: true, persistedRole };
}

async function main() {
  console.log("TipGuard onboarding live audit\nProject:", env.SUPABASE_URL);

  for (const email of emails) {
    console.log("\n" + "=".repeat(72));
    console.log("ACCOUNT:", email);
    const client = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: signIn, error: signErr } = await client.auth.signInWithPassword({ email, password });
    if (signErr || !signIn.session?.user?.id) {
      console.log("SIGN-IN FAILED:", signErr?.message, signErr?.code);
      continue;
    }
    const uid = signIn.session.user.id;
    const { data: before } = await client.from("profiles").select("id, role, full_name").eq("id", uid).maybeSingle();
    const { data: guardRow } = await client.from("guards").select("id").eq("user_id", uid).maybeSingle();
    const { data: merchRow } = await client.from("merchants").select("id").eq("user_id", uid).maybeSingle();
    console.log("uid:", uid);
    console.log("profile:", before);
    console.log("rows:", { hasGuard: !!guardRow?.id, hasMerchant: !!merchRow?.id });

    for (const intent of intents) {
      console.log("\n--- intent:", intent, "---");
      const result = await continueFromRole(client, uid, intent);
      const { data: after } = await client.from("profiles").select("role").eq("id", uid).maybeSingle();
      console.log("client flow result:", result);
      console.log("profile.role after:", after?.role);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
