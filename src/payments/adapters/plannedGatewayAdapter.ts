import type { PaymentAdapter, PaymentGatewayId, TipCheckoutContext } from "../types";

function notEnabled(name: string, ctx: TipCheckoutContext) {
  ctx.onError(
    `${name} is not enabled on this deployment yet. Configure keys and Edge webhooks, then register the adapter in src/payments/registry.ts.`,
  );
}

export function createPlannedAdapter(id: PaymentGatewayId, displayName: string): PaymentAdapter {
  return {
    id,
    displayName,
    isReady: () => false,
    async startTipCheckout(ctx: TipCheckoutContext) {
      notEnabled(displayName, ctx);
    },
    async startWalletTopUp(ctx) {
      notEnabled(displayName, ctx as unknown as TipCheckoutContext);
    },
  };
}
