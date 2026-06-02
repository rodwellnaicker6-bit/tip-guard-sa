/** Client-side additive platform fee (must match Edge `calcAdditivePlatformFee`). */

export const DEFAULT_PLATFORM_FEE_BPS = 200;

export type AdditiveFeeBreakdown = {
  feeBps: number;
  tipAmountCents: number;
  platformFeeCents: number;
  chargeAmountCents: number;
};

export function calcAdditivePlatformFee(
  tipAmountCents: number,
  feeBps = DEFAULT_PLATFORM_FEE_BPS,
): AdditiveFeeBreakdown {
  const tip = Math.max(0, Math.round(tipAmountCents));
  const bps = Math.max(0, feeBps);
  const platformFeeCents = Math.max(0, Math.round((tip * bps) / 10000));
  return {
    feeBps: bps,
    tipAmountCents: tip,
    platformFeeCents,
    chargeAmountCents: tip + platformFeeCents,
  };
}

export function formatFeeLine(b: AdditiveFeeBreakdown): string {
  const tip = (b.tipAmountCents / 100).toFixed(2);
  const fee = (b.platformFeeCents / 100).toFixed(2);
  const total = (b.chargeAmountCents / 100).toFixed(2);
  return `Tip R${tip} + platform fee R${fee} = R${total} total`;
}
