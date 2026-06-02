/** Additive platform fee: customer pays tip + fee; merchant/guard receives full tip. */

export type AdditiveFeeBreakdown = {
  feeBps: number;
  tipAmountCents: number;
  platformFeeCents: number;
  chargeAmountCents: number;
  feeModel: "additive";
};

export function calcAdditivePlatformFee(tipAmountCents: number, feeBps: number): AdditiveFeeBreakdown {
  const tip = Math.max(0, Math.round(tipAmountCents));
  const bps = Math.max(0, feeBps);
  const platformFeeCents = Math.max(0, Math.round((tip * bps) / 10000));
  return {
    feeBps: bps,
    tipAmountCents: tip,
    platformFeeCents,
    chargeAmountCents: tip + platformFeeCents,
    feeModel: "additive",
  };
}
