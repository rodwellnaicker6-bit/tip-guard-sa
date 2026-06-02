/** Force blocked onboarding state: merchant row + guard intent. */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_ANON_KEY"]);
const uid = "6c7c1a29-a905-4ca5-b686-780018ec6179";
const orphanId = "f0000001-0001-4001-8001-000000000099";

async function main() {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  await admin.from("profiles").update({ role: "merchant" }).eq("id", uid);
  await admin.from("merchants").upsert({
    id: orphanId,
    user_id: uid,
    business_name: "Trace Orphan",
    verified: true,
  });

  const email = (await admin.auth.admin.getUserById(uid)).data.user!.email!;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const sess = await anon.auth.verifyOtp({
    token_hash: link.data!.properties!.hashed_token,
    type: "magiclink",
  });
  const client = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${sess.data.session!.access_token}` } },
    auth: { persistSession: false },
  });

  const rpc = await client.rpc("save_onboarding_role", { p_role: "guard" });
  console.log(
    JSON.stringify(
      {
        frontendRequest: {
          method: "POST",
          url: `${env.SUPABASE_URL}/rest/v1/rpc/save_onboarding_role`,
          body: { p_role: "guard" },
        },
        rpc: {
          data: rpc.data,
          error: rpc.error
            ? {
                code: rpc.error.code,
                message: rpc.error.message,
                details: rpc.error.details,
                hint: rpc.error.hint,
              }
            : null,
        },
      },
      null,
      2,
    ),
  );

  const upd = await client.from("profiles").update({ role: "guard" }).eq("id", uid).select("role").maybeSingle();
  console.log(
    JSON.stringify(
      {
        frontendRequest: {
          method: "PATCH",
          url: `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}`,
          body: { role: "guard" },
        },
        update: {
          data: upd.data,
          error: upd.error
            ? {
                code: upd.error.code,
                message: upd.error.message,
                details: upd.error.details,
                hint: upd.error.hint,
              }
            : null,
        },
      },
      null,
      2,
    ),
  );

  await admin.from("merchants").delete().eq("id", orphanId);
  await admin.from("profiles").update({ role: "customer" }).eq("id", uid);
}

main();
