import type { NavigateFunction } from "react-router-dom";

export type PaymentGatewayId =
  | "paystack"
  | "yoco"
  | "payfast"
  | "ozow"
  | "peach_payments"
  | "apple_pay"
  | "google_pay";

/** Providers with server webhook + settlement (excludes wallet UI-only ids). */
export type SettlementGatewayId = "paystack" | "yoco" | "payfast" | "ozow" | "peach_payments";

export type CheckoutKind = "tip" | "wallet_topup";

export type CheckoutPhase = "idle" | "initializing" | "opening_checkout";

export type TipCheckoutContext = {
  kind: CheckoutKind;
  guardId?: string;
  /** QR / tip link token for session anti-replay (paystack-initialize). */
  sourceLinkToken?: string;
  amountCents: number;
  navigate: NavigateFunction;
  onError: (message: string) => void;
  onCheckoutDismissed?: () => void;
  onCheckoutPhase?: (phase: CheckoutPhase) => void;
};

export type PaymentAdapter = {
  id: PaymentGatewayId;
  displayName: string;
  /** True when env + server paths are configured for production checkout. */
  isReady: () => boolean;
  startTipCheckout: (ctx: TipCheckoutContext) => Promise<void>;
  startWalletTopUp?: (ctx: Omit<TipCheckoutContext, "guardId">) => Promise<void>;
};

export type WebhookEventStub = {
  provider: PaymentGatewayId;
  eventId: string;
  type: string;
  raw: unknown;
  receivedAt: string;
};
