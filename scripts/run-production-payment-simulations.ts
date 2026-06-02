/**
 * Run 10 end-to-end production payment simulations (API-level).
 * Guest auth → paystack-initialize → signed webhook → payment-status → guard wallet → merchant tips.
 *
 * Usage: npx tsx scripts/run-production-payment-simulations.ts
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { loadEnvFiles, requireEnv } from "./lib/env.js";

loadEnvFiles();

const env = requireEnv([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "PAYSTACK_SECRET_KEY",
]);

const GUARD_ID = process.env.DEMO_GUARD_ID?.trim() || "b1000003-0003-4003-8003-000000000003";
const RUNS = Number(process.env.SIM_RUNS ?? "10");
const base = env.SUPABASE_URL.replace(/\/$/, "");

function signWebhook(body: string, secret: string): string {
  return createHmac("sha512", secret).update(body).digest("hex");
}

async function main() {
  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data: guardRow } = await service
    .from("guards")
    .select("id, merchant_id, balance_cents")
    .eq("id", GUARD_ID)
    .maybeSingle();

  if (!guardRow?.id) {
    console.error("Guard not found:", GUARD_ID);
    process.exit(1);
  }

  let passed = 0;
  const failures: string[] = [];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 1; i <= RUNS; i++) {
    const label = `run-${i}/${RUNS}`;
    if (i > 1) await sleep(6_500);
    try {
      const { data: anonData, error: anonErr } = await anon.auth.signInAnonymously();
      if (anonErr || !anonData.session) throw new Error(anonErr?.message ?? "anonymous sign-in failed");

      const jwt = anonData.session.access_token;
      const amountCents = 1000 + i * 11;

      const initRes = await fetch(`${base}/functions/v1/paystack-initialize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
          apikey: env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          kind: "tip",
          guard_id: GUARD_ID,
          amount_cents: amountCents,
        }),
      });
      const initJson = (await initRes.json()) as {
        reference?: string;
        authorization_url?: string;
        charge_amount_cents?: number;
        tip_amount_cents?: number;
        error?: string;
      };
      if (!initRes.ok || !initJson.reference) {
        throw new Error(`init ${initRes.status}: ${initJson.error ?? JSON.stringify(initJson).slice(0, 120)}`);
      }

      const reference = initJson.reference;
      const chargeCents = initJson.charge_amount_cents ?? amountCents;

      const { data: walletBefore } = await service
        .from("wallet_accounts")
        .select("available_cents")
        .eq("guard_id", GUARD_ID)
        .maybeSingle();
      const balanceBefore =
        (walletBefore?.available_cents as number | undefined) ??
        (guardRow.balance_cents as number) ??
        0;

      const webhookPayload = {
        event: "charge.success",
        data: {
          id: Date.now() + i,
          reference,
          amount: amountCents,
          status: "success",
          metadata: { type: "guard_tip", guard_id: GUARD_ID },
        },
      };
      const raw = JSON.stringify(webhookPayload);
      const sig = signWebhook(raw, env.PAYSTACK_SECRET_KEY);
      const whRes = await fetch(`${base}/functions/v1/paystack-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-paystack-signature": sig },
        body: raw,
      });
      if (!whRes.ok) {
        const whText = await whRes.text();
        throw new Error(`webhook ${whRes.status}: ${whText.slice(0, 160)}`);
      }

      await sleep(1_200);

      let confirmed = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        const statusRes = await fetch(`${base}/functions/v1/payment-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ reference }),
        });
        const statusJson = (await statusRes.json()) as {
          verified?: boolean;
          tip_status?: string;
          error?: string;
        };
        if (
          statusRes.ok &&
          (statusJson.verified || statusJson.tip_status === "succeeded")
        ) {
          confirmed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 800));
      }
      if (!confirmed) throw new Error("payment-status never confirmed");

      const { data: tip } = await service
        .from("tips")
        .select("status, amount_cents, commission_cents, customer_paid_cents")
        .eq("paystack_reference", reference)
        .maybeSingle();
      if (tip?.status !== "succeeded") throw new Error(`tip status ${tip?.status ?? "missing"}`);
      const expectedFee = Math.round((amountCents * 200) / 10000);
      if (tip.commission_cents !== expectedFee) {
        throw new Error(`fee mismatch expected ${expectedFee} got ${tip.commission_cents}`);
      }
      if (tip.customer_paid_cents !== amountCents + expectedFee) {
        throw new Error(`charge mismatch ${tip.customer_paid_cents} vs ${amountCents + expectedFee}`);
      }

      const { data: trace } = await service
        .from("payment_traces")
        .select("payment_reference, guard_id, tip_amount_cents, allocated_amount_cents, wallet_before_cents, wallet_after_cents")
        .eq("payment_reference", reference)
        .maybeSingle();
      if (!trace?.payment_reference) {
        throw new Error("payment_traces row missing (apply migration 20260630140000)");
      }

      const { data: walletAfter } = await service
        .from("wallet_accounts")
        .select("available_cents")
        .eq("guard_id", GUARD_ID)
        .maybeSingle();
      const balanceAfter = (walletAfter?.available_cents as number | undefined) ?? 0;
      if (balanceAfter < balanceBefore) {
        throw new Error(`wallet decreased ${balanceBefore} → ${balanceAfter}`);
      }

      if (guardRow.merchant_id) {
        const { count } = await service
          .from("tips")
          .select("id", { count: "exact", head: true })
          .eq("status", "succeeded")
          .in(
            "guard_id",
            (
              await service.from("guards").select("id").eq("merchant_id", guardRow.merchant_id)
            ).data?.map((g) => g.id) ?? [GUARD_ID],
          );
        if ((count ?? 0) < 1) throw new Error("merchant tips count empty");
      }

      passed += 1;
      console.log(`PASS ${label}`, reference, `wallet +${balanceAfter - balanceBefore}c`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${label}: ${msg}`);
      console.log(`FAIL ${label}`, msg);
    }
  }

  console.log(`\n--- ${passed}/${RUNS} simulations passed ---`);
  if (failures.length) {
    for (const f of failures) console.log(" ", f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
