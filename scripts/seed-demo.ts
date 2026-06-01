/**
 * Seeds staging demo users, merchant, guard, QR codes, and sample transactions.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ optional DEMO_PASSWORD).
 *
 * Usage: npx tsx scripts/seed-demo.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();

const env = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
const DEMO_PASSWORD = process.env.DEMO_PASSWORD?.trim() || "TipGuardDemo2026!";

import { DEMO_IDS } from "./demo-ids.js";

export { DEMO_IDS };

const USERS = [
  { id: DEMO_IDS.admin, email: "demo-admin@tipguard.staging", role: "admin", name: "Demo Admin" },
  { id: DEMO_IDS.merchant, email: "demo-merchant@tipguard.staging", role: "merchant", name: "Demo Merchant" },
  { id: DEMO_IDS.guard, email: "demo-guard@tipguard.staging", role: "guard", name: "Demo Guard" },
  { id: DEMO_IDS.customer, email: "demo-customer@tipguard.staging", role: "customer", name: "Demo Customer" },
] as const;

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureUser(u: (typeof USERS)[number]) {
  const { data: existing } = await admin.auth.admin.getUserById(u.id);
  if (existing?.user) {
    await admin.auth.admin.updateUserById(u.id, {
      email: u.email,
      password: DEMO_PASSWORD,
      user_metadata: { role: u.role, full_name: u.name },
    });
    console.log(`  ↻ user ${u.email}`);
  } else {
    const { error } = await admin.auth.admin.createUser({
      id: u.id,
      email: u.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { role: u.role, full_name: u.name },
    });
    if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
    console.log(`  + user ${u.email}`);
  }
  const { error: pErr } = await admin.from("profiles").upsert(
    { id: u.id, role: u.role, full_name: u.name },
    { onConflict: "id" },
  );
  if (pErr) {
    const msg = pErr.message.toLowerCase();
    if (msg.includes("schema cache") || msg.includes("does not exist")) {
      throw new Error(
        `profile ${u.email}: ${pErr.message} — run supabase db push or npm run db:apply (see docs/CONNECT_SUPABASE.md)`,
      );
    }
    throw new Error(`profile ${u.email}: ${pErr.message}`);
  }
}

async function main() {
  console.log("TipGuard — seed demo data\n");

  for (const u of USERS) await ensureUser(u);

  const { error: mErr } = await admin.from("merchants").upsert(
    {
      id: DEMO_IDS.merchantRow,
      user_id: DEMO_IDS.merchant,
      business_name: "TipGuard Demo Venue",
      location: "Sandton, Gauteng",
      verified: true,
    },
    { onConflict: "id" },
  );
  if (mErr) throw new Error(`merchant: ${mErr.message}`);

  let locationId: string | null = DEMO_IDS.locationRow;
  const { error: locErr } = await admin.from("merchant_locations").upsert(
    {
      id: DEMO_IDS.locationRow,
      merchant_id: DEMO_IDS.merchantRow,
      name: "Main entrance",
      address: "Demo Mall, Rivonia Rd",
      province: "Gauteng",
      active: true,
    },
    { onConflict: "id" },
  );
  if (locErr) {
    if (locErr.message.includes("schema cache") || locErr.message.includes("does not exist")) {
      console.warn(`  ⚠ merchant_locations skipped — run: npm run db:push or npm run db:apply`);
      locationId = null;
    } else {
      throw new Error(`location: ${locErr.message}`);
    }
  }

  const guardRow: Record<string, unknown> = {
    id: DEMO_IDS.guardRow,
    user_id: DEMO_IDS.guard,
    display_name: "Nomsa Demo",
    location: "Main entrance",
    province: "Gauteng",
    avatar_initials: "ND",
    verified: true,
    rating: 4.9,
    tips_count: 42,
    balance_cents: 125000,
    merchant_id: DEMO_IDS.merchantRow,
  };
  if (locationId) guardRow.location_id = locationId;

  let { error: gErr } = await admin.from("guards").upsert(guardRow, { onConflict: "id" });
  if (gErr?.message.includes("merchant_id")) {
    delete guardRow.merchant_id;
    delete guardRow.location_id;
    ({ error: gErr } = await admin.from("guards").upsert(guardRow, { onConflict: "id" }));
  }
  if (gErr) throw new Error(`guard: ${gErr.message}`);

  const tipLinkRow: Record<string, unknown> = { token: DEMO_IDS.qrToken, guard_id: DEMO_IDS.guardRow };
  let { error: tlErr } = await admin.from("tip_links").upsert(
    { ...tipLinkRow, scan_count: 128 },
    { onConflict: "token" },
  );
  if (tlErr?.message.includes("scan_count")) {
    ({ error: tlErr } = await admin.from("tip_links").upsert(tipLinkRow, { onConflict: "token" }));
  }
  if (tlErr) throw new Error(`tip_link: ${tlErr.message}`);

  const qrRow: Record<string, unknown> = {
    guard_id: DEMO_IDS.guardRow,
    code_token: DEMO_IDS.qrToken,
    label: "Staging demo QR",
    created_by: DEMO_IDS.guard,
  };
  if (locationId) {
    qrRow.location_id = locationId;
    qrRow.default_amount_cents = 2000;
  }
  let { error: qcErr } = await admin.from("qr_codes").upsert(qrRow, { onConflict: "code_token" });
  if (qcErr?.message.includes("default_amount_cents") || qcErr?.message.includes("location_id")) {
    delete qrRow.default_amount_cents;
    delete qrRow.location_id;
    ({ error: qcErr } = await admin.from("qr_codes").upsert(qrRow, { onConflict: "code_token" }));
  }
  if (qcErr) throw new Error(`qr_code: ${qcErr.message}`);

  const sampleTips = [
    { amount_cents: 2000, status: "succeeded" as const, ref: "demo_tg_001" },
    { amount_cents: 5000, status: "succeeded" as const, ref: "demo_tg_002" },
    { amount_cents: 1000, status: "pending" as const, ref: "demo_tg_003" },
  ];

  const demoRefs = sampleTips.map((t) => t.ref);
  await admin.from("transactions").delete().in("paystack_reference", demoRefs);
  await admin.from("tips").delete().in("paystack_reference", demoRefs);

  for (const t of sampleTips) {
    const tipPayload: Record<string, unknown> = {
      guard_id: DEMO_IDS.guardRow,
      payer_id: DEMO_IDS.customer,
      amount_cents: t.amount_cents,
      paystack_reference: t.ref,
      status: t.status,
    };
    const { error: tipErr } = await admin.from("tips").insert(tipPayload);
    if (tipErr && !tipErr.message.includes("duplicate")) throw new Error(`tip ${t.ref}: ${tipErr.message}`);

    const txPayload: Record<string, unknown> = {
      user_id: DEMO_IDS.customer,
      type: "tip",
      amount_cents: t.amount_cents,
      currency: "ZAR",
      status: t.status === "succeeded" ? "succeeded" : "pending",
      paystack_reference: t.ref,
      metadata: { guard_id: DEMO_IDS.guardRow, demo: true },
    };
    const { error: txErr } = await admin.from("transactions").insert(txPayload);
    if (txErr && !txErr.message.includes("duplicate")) throw new Error(`transaction ${t.ref}: ${txErr.message}`);
  }

  const appUrl = process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:5173";
  console.log("\n✓ Demo seed complete.\n");
  console.log("Accounts (password from DEMO_PASSWORD or default):");
  for (const u of USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
  console.log(`\nQR tip URL: ${appUrl}/tip/${DEMO_IDS.qrToken}`);
  console.log(`Legacy URL: ${appUrl}/t/${DEMO_IDS.qrToken}`);
  console.log("\nSet VITE_DEMO_MODE=true on Vercel staging for one-click demo login.");
}

const isMain = process.argv[1]?.includes("seed-demo");
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
