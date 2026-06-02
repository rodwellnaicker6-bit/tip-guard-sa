/**
 * Production onboarding trace for a specific auth UID (service role read + RPC replay).
 * Usage: npx tsx scripts/trace-prod-user-onboarding.ts <uid> [merchant|guard]
 */
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
const uid = process.argv[2]?.trim();
const intent = (process.argv[3]?.trim() ?? "merchant") as "merchant" | "guard" | "customer";

if (!uid) {
  console.error("Usage: npx tsx scripts/trace-prod-user-onboarding.ts <uid> [merchant|guard|customer]");
  process.exit(1);
}

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function logOp(label: string, fields: Record<string, unknown>) {
  console.log(`\n--- ${label} ---`);
  for (const [k, v] of Object.entries(fields)) {
    console.log(`${k}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : v}`);
  }
}

function errDetail(err: PostgrestError | null) {
  return {
    ERROR_CODE: err?.code ?? null,
    ERROR_MESSAGE: err?.message ?? null,
    HTTP_STATUS: (err as PostgrestError & { status?: number })?.status ?? null,
  };
}

async function timed<T extends { data?: unknown; error?: PostgrestError | null; count?: number | null }>(
  table: string,
  operation: string,
  payload: Record<string, unknown>,
  run: () => Promise<T>,
) {
  const t0 = performance.now();
  const result = await run();
  const rows =
    result.count ??
    (Array.isArray(result.data) ? result.data.length : result.data != null ? 1 : 0);
  logOp(`${table} · ${operation}`, {
    TABLE: table,
    OPERATION: operation,
    PAYLOAD: payload,
    DURATION_MS: Math.round(performance.now() - t0),
    ROWS_AFFECTED: rows,
    ...errDetail(result.error ?? null),
    DATA: result.data ?? null,
  });
  return result;
}

async function tableExists(name: string): Promise<boolean> {
  const { error } = await admin.from(name).select("*").limit(0);
  if (!error) return true;
  if (error.message.includes("does not exist") || error.code === "42P01") return false;
  return true;
}

async function rowCheck(table: string, filter: Record<string, string>) {
  const exists = await tableExists(table);
  if (!exists) {
    console.log(`\nTABLE: ${table}`);
    console.log("ROW EXISTS: N/A (table not in schema)");
    return;
  }
  let q = admin.from(table).select("*");
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data, error } = await q.maybeSingle();
  console.log(`\nTABLE: ${table}`);
  if (error) {
    console.log(`ROW EXISTS: ERROR — ${error.code} ${error.message}`);
    return;
  }
  console.log(`ROW EXISTS: ${data ? "YES" : "NO"}`);
  if (data) console.log("ROW:", JSON.stringify(data, null, 2));
}

async function replayOnboardingAsUser(pRole: string) {
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: (await admin.auth.admin.getUserById(uid)).data.user?.email ?? "",
  });
  if (linkErr || !link.properties?.hashed_token) {
    logOp("auth replay", {
      TABLE: "auth",
      OPERATION: "generateLink",
      PAYLOAD: { uid },
      ...errDetail(linkErr),
      NOTE: "Cannot mint user JWT — RPC replay skipped",
    });
    return;
  }

  const anon = createClient(env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: otpErr } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (otpErr || !session.session) {
    logOp("auth replay", {
      TABLE: "auth",
      OPERATION: "verifyOtp",
      ...errDetail(otpErr),
    });
    return;
  }

  const userClient = createClient(env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "", {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await timed("rpc", "RPC save_onboarding_role", { p_role: pRole }, () =>
    userClient.rpc("save_onboarding_role", { p_role: pRole }),
  );

  const { error: rpcErr } = await userClient.rpc("save_onboarding_role", { p_role: pRole });
  if (rpcErr) {
    await timed("profiles", "UPDATE role (fallback)", { id: uid, role: pRole }, () =>
      userClient.from("profiles").update({ role: pRole }).eq("id", uid).select("role").maybeSingle(),
    );
    const { data: prof } = await userClient.from("profiles").select("role").eq("id", uid).maybeSingle();
    if (!prof?.role) {
      await timed("profiles", "INSERT bootstrap", { id: uid, role: "customer" }, () =>
        userClient.from("profiles").insert({ id: uid, role: "customer", full_name: "Member" }),
      );
      await timed("profiles", "UPDATE role (retry)", { id: uid, role: pRole }, () =>
        userClient.from("profiles").update({ role: pRole }).eq("id", uid).select("role").maybeSingle(),
      );
    }
  }
}

async function main() {
  console.log("TipGuard production onboarding trace");
  console.log("UID:", uid);
  console.log("Intent:", intent);
  console.log("Project:", env.SUPABASE_URL);

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(uid);
  logOp("auth.users", {
    TABLE: "auth.users",
    OPERATION: "admin.getUserById",
    PAYLOAD: { uid },
    DURATION_MS: 0,
    ROWS_AFFECTED: authUser?.user ? 1 : 0,
    ERROR_CODE: authErr?.code ?? null,
    ERROR_MESSAGE: authErr?.message ?? null,
    EMAIL: authUser?.user?.email ?? null,
    METADATA_ROLE: authUser?.user?.user_metadata?.role ?? null,
  });

  console.log("\n========== ROW EXISTENCE (UID) ==========");
  await rowCheck("profiles", { id: uid });
  await rowCheck("user_profiles", { id: uid });
  await rowCheck("user_profiles", { user_id: uid });
  await rowCheck("customer_profiles", { user_id: uid });
  await rowCheck("customer_profiles", { id: uid });
  await rowCheck("merchant_profiles", { user_id: uid });
  await rowCheck("merchant_profiles", { id: uid });
  await rowCheck("guards", { user_id: uid });
  await rowCheck("merchants", { user_id: uid });
  await rowCheck("customer_wallets", { user_id: uid });

  console.log("\n========== ONBOARDING PATH (client mirror) ==========");
  console.log("Primary table: profiles (column: role)");
  console.log("Primary RPC: save_onboarding_role(p_role)");

  await replayOnboardingAsUser(intent);

  // Profile step (saveProfile) — separate from role pick
  const email = authUser?.user?.email;
  if (email && process.env.VITE_SUPABASE_ANON_KEY?.trim()) {
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link?.properties?.hashed_token) {
      const anon = createClient(env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY.trim(), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: session } = await anon.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: "magiclink",
      });
      if (session.session) {
        const userClient = createClient(env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY.trim(), {
          global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        await timed(
          "profiles",
          "UPDATE full_name phone (saveProfile step)",
          { id: uid, full_name: "Trace Test", phone: null },
          () =>
            userClient
              .from("profiles")
              .update({ full_name: "Trace Test", phone: null })
              .eq("id", uid)
              .select("id")
              .maybeSingle(),
        );
        await timed(
          "customer_wallets",
          "SELECT balance (wallet dashboard)",
          { user_id: uid },
          () =>
            userClient.from("customer_wallets").select("balance_cents").eq("user_id", uid).maybeSingle(),
        );
      }
    }
  }

  console.log("\n========== POST-TRACE STATE ==========");
  await rowCheck("profiles", { id: uid });
  await rowCheck("guards", { user_id: uid });
  await rowCheck("merchants", { user_id: uid });
  await rowCheck("customer_wallets", { user_id: uid });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
