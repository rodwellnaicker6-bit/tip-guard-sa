/**
 * Trace payer email used by paystack-initialize for a user id or demo email.
 * Usage: npx tsx scripts/trace-paystack-email.ts [userId|email]
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();
const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_CUSTOMER_ID = "d1000004-0004-4004-8004-000000000004";

/** Mirror supabase/functions/_shared/paystackEmail.ts */
function resolvePaystackCheckoutEmail(
  authEmail: string | undefined | null,
  userId: string,
): { email: string; source: string } {
  const trimmed = authEmail?.trim() ?? "";
  const BASIC = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const blocked = [".local", ".staging", ".invalid", ".test"];
  const ok = (e: string) => {
    if (!BASIC.test(e)) return false;
    const d = e.split("@")[1]?.toLowerCase() ?? "";
    return !blocked.some((s) => d.endsWith(s));
  };
  if (trimmed && ok(trimmed)) return { email: trimmed, source: "auth" };
  if (trimmed.includes("@")) {
    const [local, domain] = trimmed.split("@");
    if (domain?.toLowerCase() === "tipguard.staging") {
      const mapped = `${local.replace(/[^a-zA-Z0-9._+-]/g, "") || "payer"}@checkout.tipguardsa.co.za`;
      if (ok(mapped)) return { email: mapped, source: "mapped_staging" };
    }
  }
  const tag = userId.replace(/-/g, "").slice(0, 12);
  const hint = trimmed.includes("@") ? trimmed.split("@")[0] : "payer";
  return {
    email: `${(hint.replace(/[^a-zA-Z0-9._+-]/g, "") || "payer")}+${tag}@checkout.tipguardsa.co.za`,
    source: "synthetic",
  };
}

async function main() {
  const arg = process.argv[2]?.trim() || DEMO_CUSTOMER_ID;
  let userId = arg;
  if (arg.includes("@")) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    const hit = data.users.find((u) => u.email?.toLowerCase() === arg.toLowerCase());
    if (!hit) {
      console.error("No auth user for email", arg);
      process.exit(1);
    }
    userId = hit.id;
  }

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    console.error(error?.message ?? "user not found");
    process.exit(1);
  }
  const u = data.user;
  const resolved = resolvePaystackCheckoutEmail(u.email, u.id);
  const selected = resolved.email;
  const { data: prof } = await admin.from("profiles").select("id, role, full_name, phone").eq("id", u.id).maybeSingle();

  console.log("=== Raw customer (auth.users via admin) ===");
  console.log(JSON.stringify({
    id: u.id,
    email: u.email,
    email_is_empty_string: u.email === "",
    phone: u.phone,
    confirmed: u.email_confirmed_at,
    user_metadata: u.user_metadata,
  }, null, 2));
  console.log("\n=== Profile row ===");
  console.log(prof ?? "(none)");
  console.log("\n=== Email selected for checkout (resolvePaystackCheckoutEmail) ===");
  console.log({ ...resolved, validation: "paystack_accepts=" + (selected.endsWith("@checkout.tipguardsa.co.za") || !selected.includes(".staging")) });
  console.log("\n=== Would send to Paystack initialize body ===");
  console.log(JSON.stringify({ email: selected, amount: 2000, currency: "ZAR" }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
