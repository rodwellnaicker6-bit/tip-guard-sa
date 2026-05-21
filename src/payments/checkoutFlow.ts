import type { TipCheckoutContext } from "./types";
import { getDefaultTipGateway, getPaymentAdapter } from "./registry";

/** Production entry: picks gateway from env (default Paystack) and delegates to adapter. */
export async function startTipCheckout(ctx: TipCheckoutContext): Promise<void> {
  const gateway = getDefaultTipGateway();
  const adapter = getPaymentAdapter(gateway);
  await adapter.startTipCheckout(ctx);
}

export async function startWalletTopUpCheckout(
  ctx: Omit<TipCheckoutContext, "guardId" | "kind"> & { kind: "wallet_topup" },
): Promise<void> {
  const gateway = getDefaultTipGateway();
  const adapter = getPaymentAdapter(gateway);
  if (!adapter.startWalletTopUp) {
    ctx.onError("Wallet top-up is not implemented for this gateway.");
    return;
  }
  await adapter.startWalletTopUp(ctx);
}
