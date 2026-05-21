/**
 * Registry of payment surfaces TipGuard is structured to support.
 * Only Paystack is wired end-to-end today; others are integration placeholders.
 */
export type PaymentProviderId = "paystack" | "peach_payments" | "ozow" | "apple_pay" | "google_pay";

export type PaymentIntegrationSurface = "edge" | "client_hosted" | "wallet" | "planned";

export type PaymentProviderDefinition = {
  id: PaymentProviderId;
  displayName: string;
  surface: PaymentIntegrationSurface;
  /** When true, production code paths may call this provider. */
  productionReady: boolean;
  notes?: string;
};

export const PAYMENT_PROVIDERS: readonly PaymentProviderDefinition[] = [
  {
    id: "paystack",
    displayName: "Paystack",
    surface: "edge",
    productionReady: true,
    notes: "ZAR card and bank channels; Apple Pay / Google Pay depend on Paystack and device.",
  },
  {
    id: "peach_payments",
    displayName: "Peach Payments",
    surface: "planned",
    productionReady: false,
    notes: "Add Edge init + webhook mirroring paystack-initialize / paystack-webhook patterns.",
  },
  {
    id: "ozow",
    displayName: "Ozow",
    surface: "planned",
    productionReady: false,
    notes: "Instant EFT — typically redirect or hosted payment page.",
  },
  {
    id: "apple_pay",
    displayName: "Apple Pay",
    surface: "wallet",
    productionReady: false,
    notes: "Expose via Paystack where supported, or native Peach / platform tokenization later.",
  },
  {
    id: "google_pay",
    displayName: "Google Pay",
    surface: "wallet",
    productionReady: false,
    notes: "Same as Apple Pay — wallet button inside active gateway checkout when available.",
  },
] as const;

export function getDefaultCheckoutProvider(): PaymentProviderId {
  return "paystack";
}

export function listProductionReadyProviders(): PaymentProviderDefinition[] {
  return PAYMENT_PROVIDERS.filter((p) => p.productionReady);
}
