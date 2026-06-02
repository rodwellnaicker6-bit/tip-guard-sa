/** Canonical production origin when Edge secrets are missing (Paystack callback redirect). */
export const DEFAULT_PUBLIC_APP_ORIGIN = "https://tipguardsa.co.za";

export type PublicAppOriginResolution = {
  origin: string;
  source: "PUBLIC_APP_URL" | "VITE_PUBLIC_APP_URL" | "APP_URL" | "default_production";
};

function normalizeOrigin(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Resolve public app origin for Paystack callback_url (never empty in production). */
export function resolvePublicAppOrigin(): PublicAppOriginResolution {
  const candidates: Array<{ key: PublicAppOriginResolution["source"]; value: string | undefined }> = [
    { key: "PUBLIC_APP_URL", value: Deno.env.get("PUBLIC_APP_URL") },
    { key: "VITE_PUBLIC_APP_URL", value: Deno.env.get("VITE_PUBLIC_APP_URL") },
    { key: "APP_URL", value: Deno.env.get("APP_URL") },
  ];

  for (const { key, value } of candidates) {
    const origin = normalizeOrigin(value);
    if (origin) return { origin, source: key };
  }

  return { origin: DEFAULT_PUBLIC_APP_ORIGIN, source: "default_production" };
}

export function buildPaystackSuccessCallbackUrl(opts: {
  reference: string;
  kind: "tip" | "wallet_topup";
  amountCents: number;
  platformFeeCents?: number;
  chargeAmountCents?: number;
}): { callbackUrl: string; origin: PublicAppOriginResolution } {
  const resolution = resolvePublicAppOrigin();
  const qs = new URLSearchParams({
    ref: opts.reference,
    reference: opts.reference,
    kind: opts.kind,
    amount_cents: String(opts.amountCents),
  });
  if (opts.platformFeeCents != null && opts.platformFeeCents >= 0) {
    qs.set("platform_fee_cents", String(opts.platformFeeCents));
  }
  if (opts.chargeAmountCents != null && opts.chargeAmountCents > 0) {
    qs.set("charge_amount_cents", String(opts.chargeAmountCents));
  }
  const callbackUrl = `${resolution.origin}/payment/success?${qs.toString()}`;

  return { callbackUrl, origin: resolution };
}
