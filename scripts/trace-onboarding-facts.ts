/**
 * Production facts-only onboarding trace (mirrors Onboarding.tsx continueFromRole).
 * Usage: npx tsx scripts/trace-onboarding-facts.ts <uid> <merchant|guard>
 */
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_ANON_KEY"]);
const uid = process.argv[2]?.trim();
const intent = (process.argv[3]?.trim() ?? "merchant") as "merchant" | "guard";

if (!uid) {
  console.error("Usage: npx tsx scripts/trace-onboarding-facts.ts <uid> [merchant|guard]");
  process.exit(1);
}

function facts(label: string, payload: Record<string, unknown>) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

function postgrestErr(e: PostgrestError | null) {
  if (!e) return null;
  return {
    code: e.code ?? null,
    message: e.message ?? null,
    details: e.details ?? null,
    hint: e.hint ?? null,
    httpStatus: (e as PostgrestError & { status?: number }).status ?? null,
  };
}

function unwrapRpcSingle<T>(data: unknown): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return data as T;
}

async function tableProbe(admin: ReturnType<typeof createClient>, table: string) {
  const { data, error } = await admin.from(table).select("*").limit(0);
  if (error) {
    return { exists: false, error: postgrestErr(error) };
  }
  return { exists: true, error: null };
}

async function profileRow(admin: ReturnType<typeof createClient>, id: string) {
  const { data, error } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();
  return { data, error: postgrestErr(error) };
}

async function getUserClient(email: string) {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkErr?.message}`);
  }
  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: otpErr } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (otpErr || !session.session?.access_token) {
    throw new Error(`verifyOtp failed: ${otpErr?.message}`);
  }
  return {
    client: createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    accessToken: session.session.access_token,
  };
}

async function continueFromRoleFacts(
  client: ReturnType<typeof createClient>,
  accessToken: string,
  userId: string,
  roleIntent: string,
) {
  const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, "");
  const frontendRequest = {
    method: "POST",
    url: `${supabaseUrl}/rest/v1/rpc/save_onboarding_role`,
    headers: {
      apikey: "[VITE_SUPABASE_ANON_KEY]",
      Authorization: `Bearer ${accessToken.slice(0, 12)}…`,
      "Content-Type": "application/json",
    },
    body: { p_role: roleIntent },
  };
  facts("FRONTEND REQUEST (step 1 — RPC)", frontendRequest);

  const t0 = performance.now();
  let rpcErr: PostgrestError | null = null;
  let savedRoleRaw: unknown = null;
  try {
    const res = await client.rpc("save_onboarding_role", { p_role: roleIntent });
    rpcErr = res.error;
    savedRoleRaw = res.data;
  } catch (e) {
    facts("RPC THROW", {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : null,
    });
    throw e;
  }

  facts("SUPABASE RPC save_onboarding_role", {
    durationMs: Math.round(performance.now() - t0),
    data: savedRoleRaw,
    error: postgrestErr(rpcErr),
  });

  let roleSaved = unwrapRpcSingle<string>(savedRoleRaw);
  let failingOperation: string | null = rpcErr ? "rpc.save_onboarding_role" : null;

  if (rpcErr) {
    const updReq = {
      method: "PATCH",
      url: `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`,
      body: { role: roleIntent },
    };
    facts("FRONTEND REQUEST (step 2 — fallback UPDATE)", updReq);

    const t1 = performance.now();
    const { data: row, error: updErr } = await client
      .from("profiles")
      .update({ role: roleIntent })
      .eq("id", userId)
      .select("role")
      .maybeSingle();

    facts("SUPABASE profiles UPDATE role (fallback)", {
      durationMs: Math.round(performance.now() - t1),
      data: row,
      error: postgrestErr(updErr),
    });

    if (updErr) {
      failingOperation = "profiles.update.role";
      return { failingOperation, rpcErr, updErr, roleSaved: null };
    }
    roleSaved = row?.role ?? null;

    if (!roleSaved) {
      const insReq = {
        method: "POST",
        url: `${supabaseUrl}/rest/v1/profiles`,
        body: { id: userId, role: "customer", full_name: "Member" },
      };
      facts("FRONTEND REQUEST (step 3 — INSERT)", insReq);

      const t2 = performance.now();
      const { error: insErr } = await client.from("profiles").insert({
        id: userId,
        role: "customer",
        full_name: "Member",
      });
      facts("SUPABASE profiles INSERT", {
        durationMs: Math.round(performance.now() - t2),
        error: postgrestErr(insErr),
      });
      if (insErr) {
        failingOperation = "profiles.insert";
        return { failingOperation, rpcErr, insErr, roleSaved: null };
      }

      const t3 = performance.now();
      const retry = await client
        .from("profiles")
        .update({ role: roleIntent })
        .eq("id", userId)
        .select("role")
        .maybeSingle();
      facts("SUPABASE profiles UPDATE role (retry)", {
        durationMs: Math.round(performance.now() - t3),
        data: retry.data,
        error: postgrestErr(retry.error),
      });
      if (retry.error) {
        failingOperation = "profiles.update.role.retry";
        return { failingOperation, rpcErr, updErr: retry.error, roleSaved: null };
      }
      roleSaved = retry.data?.role ?? null;
    }
  }

  if (!roleSaved) {
    failingOperation = "roleSaved_null_after_rpc";
    return { failingOperation, rpcErr, roleSaved: null, savedRoleRaw };
  }
  if (roleSaved !== roleIntent) {
    failingOperation = "persist_mismatch";
    return { failingOperation, roleSaved, roleIntent };
  }

  return { failingOperation: null, roleSaved, rpcErr };
}

async function checkMigrationViaRpc(client: ReturnType<typeof createClient>) {
  const missing = await client.rpc("save_onboarding_role_typo_probe_xx");
  const exists = await client.rpc("save_onboarding_role", { p_role: "customer" });
  facts("MIGRATION PROBE save_onboarding_role", {
    existsOnProd: !postgrestErr(exists.error)?.message?.includes("Could not find the function"),
    missingRpcError: postgrestErr(missing.error),
    note: "existsOnProd=true when function is deployed",
  });
}

async function main() {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(uid);
  facts("AUTH USER", {
    uid,
    email: authUser?.user?.email ?? null,
    error: authErr?.message ?? null,
  });
  if (!authUser?.user?.email) process.exit(1);

  for (const t of ["profiles", "customer_profiles", "guard_profiles", "merchant_profiles", "user_profiles"]) {
    const probe = await tableProbe(admin, t);
    const row =
      t === "profiles"
        ? await profileRow(admin, uid)
        : { data: null, error: null };
    facts(`TABLE ${t}`, {
      tableExists: probe.exists,
      tableProbeError: probe.error,
      rowExists: t === "profiles" ? Boolean(row.data) : "N/A",
      row: t === "profiles" ? row.data : null,
      rowError: row.error,
    });
  }

  const { client, accessToken } = await getUserClient(authUser.user.email);
  await checkMigrationViaRpc(client);

  const result = await continueFromRoleFacts(client, accessToken, uid, intent);

  const after = await profileRow(admin, uid);
  facts("PROFILE AFTER", after);

  if (result.failingOperation) {
    facts("FAILURE SUMMARY", result);
    process.exit(1);
  }
  facts("RESULT", { status: "OK", roleSaved: result.roleSaved });
}

main().catch((e) => {
  facts("UNHANDLED", {
    message: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack : null,
  });
  process.exit(1);
});
