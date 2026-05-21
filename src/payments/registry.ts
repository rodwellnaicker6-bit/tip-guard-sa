import type { PaymentAdapter, PaymentGatewayId } from "./types";
import { paystackAdapter } from "./adapters/paystackAdapter";
import { createPlannedAdapter } from "./adapters/plannedGatewayAdapter";

const registry: Record<PaymentGatewayId, PaymentAdapter> = {
  paystack: paystackAdapter,
  yoco: createPlannedAdapter("yoco", "Yoco"),
  payfast: createPlannedAdapter("payfast", "PayFast"),
  ozow: createPlannedAdapter("ozow", "Ozow"),
  peach_payments: createPlannedAdapter("peach_payments", "Peach Payments"),
  apple_pay: createPlannedAdapter("apple_pay", "Apple Pay"),
  google_pay: createPlannedAdapter("google_pay", "Google Pay"),
};

export function getPaymentAdapter(id: PaymentGatewayId): PaymentAdapter {
  return registry[id];
}

export function listPaymentAdapters(): PaymentAdapter[] {
  return Object.values(registry);
}

export function getDefaultTipGateway(): PaymentGatewayId {
  const env = import.meta.env.VITE_TIP_PAYMENT_GATEWAY?.trim().toLowerCase();
  if (env && env in registry) return env as PaymentGatewayId;
  return "paystack";
}
