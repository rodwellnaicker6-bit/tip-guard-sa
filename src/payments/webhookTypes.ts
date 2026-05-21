/** Shared webhook / settlement types for all SA payment providers. */

export type ProductionPaymentProvider = "paystack" | "yoco" | "payfast" | "ozow" | "peach_payments";

export type PaymentLifecycleStatus = "pending" | "succeeded" | "failed";

export type WebhookVerifyResult =
  | { ok: true; eventId: string; eventType: string; reference: string | null; metadata: Record<string, unknown> }
  | { ok: false; reason: string };

export type ProviderWebhookHandler = {
  provider: ProductionPaymentProvider;
  verifySignature: (rawBody: string, headers: Headers) => Promise<WebhookVerifyResult>;
  onSuccess: (payload: WebhookVerifyResult, raw: unknown) => Promise<void>;
  onFailure: (payload: WebhookVerifyResult, raw: unknown) => Promise<void>;
};
