import { payTipWithPaystack, payWalletTopUpWithPaystack } from "../../services/paystackCore";
import type { PaymentAdapter, TipCheckoutContext } from "../types";

export const paystackAdapter: PaymentAdapter = {
  id: "paystack",
  displayName: "Paystack",
  isReady: () => Boolean(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim()),
  async startTipCheckout(ctx: TipCheckoutContext) {
    if (!ctx.guardId) {
      ctx.onError("Missing guard for tip checkout");
      return;
    }
    await payTipWithPaystack({
      guardId: ctx.guardId,
      sourceLinkToken: ctx.sourceLinkToken,
      amountCents: ctx.amountCents,
      navigate: ctx.navigate,
      onError: ctx.onError,
      onCheckoutDismissed: ctx.onCheckoutDismissed,
      onCheckoutPhase: ctx.onCheckoutPhase,
      onRequiresAuth: ctx.onRequiresAuth,
    });
  },
  async startWalletTopUp(ctx) {
    await payWalletTopUpWithPaystack({
      amountCents: ctx.amountCents,
      navigate: ctx.navigate,
      onError: ctx.onError,
      onCheckoutDismissed: ctx.onCheckoutDismissed,
      onCheckoutPhase: ctx.onCheckoutPhase,
      onRequiresAuth: ctx.onRequiresAuth,
    });
  },
};
