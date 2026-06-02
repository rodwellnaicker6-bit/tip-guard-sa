/**
 * Replay two consecutive role picks (same session) like onboarding UI re-tap.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_ANON_KEY"]);
const uid = process.argv[2]?.trim() ?? "6c7c1a29-a905-4ca5-b686-780018ec6179";

async function pick(client: ReturnType<typeof createClient>, role: string) {
  const t0 = performance.now();
  const res = await client.rpc("save_onboarding_role", { p_role: role });
  console.log(
    JSON.stringify(
      {
        p_role: role,
        durationMs: Math.round(performance.now() - t0),
        data: res.data,
        error: res.error
          ? {
              code: res.error.code,
              message: res.error.message,
              details: res.error.details,
              hint: res.error.hint,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const email = (await admin.auth.admin.getUserById(uid)).data.user?.email!;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const sess = await anon.auth.verifyOtp({ token_hash: link.data.properties!.hashed_token, type: "magiclink" });
  const client = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sess.data.session!.access_token}` } },
    auth: { persistSession: false },
  });

  await admin.from("profiles").update({ role: "customer" }).eq("id", uid);
  console.log("=== pick merchant ===");
  await pick(client, "merchant");
  console.log("=== pick guard (same session) ===");
  await pick(client, "guard");
  const { data } = await admin.from("profiles").select("role").eq("id", uid).single();
  console.log("=== final role ===", data?.role);
}

main();
