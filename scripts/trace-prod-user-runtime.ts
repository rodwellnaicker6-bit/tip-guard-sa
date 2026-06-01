/**
 * Production runtime trace for one UID (mirrors post-login client queries).
 * Usage: npx tsx scripts/trace-prod-user-runtime.ts <uid> [merchant|guard]
 */
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_ANON_KEY"]);
const uid = process.argv[2]?.trim();
const roleIntent = process.argv[3]?.trim() ?? "merchant";

if (!uid) {
  console.error("Usage: npx tsx scripts/trace-prod-user-runtime.ts <uid> [merchant|guard]");
  process.exit(1);
}

const TIMEOUT_MS = 12_000;

function logQ(fields: Record<string, unknown>) {
  console.log(
    [
      `QUERY: ${fields.QUERY}`,
      `TABLE/RPC: ${fields.TABLE_RPC}`,
      `DURATION: ${fields.DURATION}ms`,
      `ROWS: ${fields.ROWS}`,
      `ERROR: ${fields.ERROR ?? "null"}`,
      `TIMEOUT: ${fields.TIMEOUT}`,
    ].join("\n"),
  );
  console.log("");
}

async function timedQuery(
  queryName: string,
  tableRpc: string,
  run: () => Promise<{ data?: unknown; error?: PostgrestError | null; count?: number | null }>,
) {
  const t0 = performance.now();
  let timeout = false;
  try {
    const result = await Promise.race([
      run(),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          timeout = true;
          reject(new Error("TIMEOUT"));
        }, TIMEOUT_MS),
      ),
    ]);
    const ms = Math.round(performance.now() - t0);
    const rows = Array.isArray(result.data)
      ? result.data.length
      : result.data != null
        ? 1
        : 0;
    logQ({
      QUERY: queryName,
      TABLE_RPC: tableRpc,
      DURATION: ms,
      ROWS: rows,
      ERROR: result.error ? `${result.error.code} ${result.error.message}` : null,
      TIMEOUT: false,
    });
    return { result, timeout: false, ms };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    const msg = e instanceof Error ? e.message : String(e);
    logQ({
      QUERY: queryName,
      TABLE_RPC: tableRpc,
      DURATION: ms,
      ROWS: 0,
      ERROR: msg,
      TIMEOUT: timeout || msg === "TIMEOUT",
    });
    return { result: null, timeout: true, ms, error: msg };
  }
}

async function getUserClient() {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authUser } = await admin.auth.admin.getUserById(uid);
  const email = authUser?.user?.email;
  if (!email) throw new Error("auth user not found");

  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (!link?.properties?.hashed_token) throw new Error("could not generate magic link");

  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (error || !session.session) throw new Error(`verifyOtp: ${error?.message}`);

  return createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rowExists(admin: ReturnType<typeof createClient>, table: string, col: string, val: string) {
  const { data, error } = await admin.from(table).select("*").eq(col, val).maybeSingle();
  console.log(`TABLE: ${table}`);
  if (error?.message.includes("does not exist") || error?.code === "PGRST205") {
    console.log("ROW EXISTS: N/A (table missing)\n");
    return;
  }
  console.log(`ROW EXISTS: ${data ? "YES" : "NO"}`);
  if (data) console.log(JSON.stringify(data, null, 2));
  console.log("");
}

async function main() {
  console.log("=== PRODUCTION RUNTIME TRACE ===");
  console.log("UID:", uid);
  console.log("");

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("=== B. PROFILE HYDRATION (service role read) ===\n");
  await rowExists(admin, "profiles", "id", uid);
  await rowExists(admin, "customer_wallets", "user_id", uid);
  await rowExists(admin, "guards", "user_id", uid);
  await rowExists(admin, "merchants", "user_id", uid);

  const client = await getUserClient();

  console.log("=== A. ONBOARDING ROLE SAVE (authenticated) ===\n");
  await timedQuery("onboarding role pick", "rpc.save_onboarding_role", () =>
    client.rpc("save_onboarding_role", { p_role: roleIntent }),
  );

  console.log("=== POST-LOGIN HYDRATION (AuthProvider parallel) ===\n");
  await timedQuery("profile hydration", "profiles.select", () =>
    client.from("profiles").select("role, full_name, phone").eq("id", uid).maybeSingle(),
  );
  await timedQuery("guard row check", "guards.select", () =>
    client.from("guards").select("id").eq("user_id", uid).maybeSingle(),
  );
  await timedQuery("merchant row check", "merchants.select", () =>
    client.from("merchants").select("id").eq("user_id", uid).maybeSingle(),
  );

  console.log("=== CUSTOMER TIPS / WALLET QUERIES ===\n");
  await timedQuery("customer tips dashboard", "rpc.get_customer_tip_stats", () =>
    client.rpc("get_customer_tip_stats"),
  );
  await timedQuery("customer tip history", "rpc.get_customer_tip_history", () =>
    client.rpc("get_customer_tip_history"),
  );
  await timedQuery("wallet balance", "customer_wallets.select", () =>
    client.from("customer_wallets").select("balance_cents").eq("user_id", uid).maybeSingle(),
  );

  const t0 = performance.now();
  let authTimeout = false;
  try {
    await Promise.race([
      client.auth.getUser(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), TIMEOUT_MS)),
    ]);
    logQ({
      QUERY: "wallet auth.getUser",
      TABLE_RPC: "auth.getUser",
      DURATION: Math.round(performance.now() - t0),
      ROWS: 1,
      ERROR: null,
      TIMEOUT: false,
    });
  } catch (e) {
    authTimeout = true;
    logQ({
      QUERY: "wallet auth.getUser",
      TABLE_RPC: "auth.getUser",
      DURATION: Math.round(performance.now() - t0),
      ROWS: 0,
      ERROR: e instanceof Error ? e.message : String(e),
      TIMEOUT: authTimeout,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
