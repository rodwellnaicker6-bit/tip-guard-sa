const PAYSTACK_INLINE_SRC = "https://js.paystack.co/v1/inline.js";

export type PaystackInlineOptions = {
  key: string;
  email: string;
  amountSubunits: number;
  currency: "ZAR";
  reference: string;
  accessCode: string;
  channels?: string[];
  onSuccess: (reference: string) => void;
  onClose: () => void;
};

export type PaystackInlineApi = {
  setup: (opts: Record<string, unknown>) => unknown;
};

declare global {
  interface Window {
    PaystackPop?: PaystackInlineApi;
  }
}

let loadPromise: Promise<void> | null = null;

/** Paystack amounts for ZAR use the smallest unit (cents), same as `amount_cents` stored in the database. */
export function zarSubunitsFromCents(amountCents: number): number {
  return Math.round(amountCents);
}

/** Lazy-load Paystack only when checkout opens (keeps initial bundle small). */
export function loadPaystackInlineScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.PaystackPop) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PAYSTACK_INLINE_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Paystack script failed")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = PAYSTACK_INLINE_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Paystack Inline"));
    document.body.appendChild(s);
  });
  return loadPromise;
}

export async function openPaystackInline(opts: PaystackInlineOptions): Promise<void> {
  await loadPaystackInlineScript();
  const PaystackPop = window.PaystackPop;
  if (!PaystackPop?.setup) {
    throw new Error("Paystack Inline is not available on this page.");
  }
  PaystackPop.setup({
    key: opts.key,
    email: opts.email,
    amount: opts.amountSubunits,
    currency: opts.currency,
    ref: opts.reference,
    access_code: opts.accessCode,
    channels: opts.channels ?? ["card", "bank", "apple_pay"],
    callback: (res: { reference?: string; trxref?: string }) => {
      const ref = res.reference ?? res.trxref ?? opts.reference;
      opts.onSuccess(ref);
    },
    onClose: () => {
      opts.onClose();
    },
  });
}
