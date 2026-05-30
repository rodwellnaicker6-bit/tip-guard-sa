const PAYSTACK_INLINE_SRC = "https://js.paystack.co/v1/inline.js";
const PAYSTACK_SCRIPT_TIMEOUT_MS = 15_000;

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
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PAYSTACK_INLINE_SRC}"]`);
    let timer: number | null = null;
    const clearTimer = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = null;
    };
    const fail = (message: string) => {
      clearTimer();
      reject(new Error(message));
    };
    if (existing) {
      if (window.PaystackPop) {
        resolve();
        return;
      }
      timer = window.setTimeout(() => fail("Paystack script load timed out"), PAYSTACK_SCRIPT_TIMEOUT_MS);
      existing.addEventListener("load", () => {
        clearTimer();
        resolve();
      }, { once: true });
      existing.addEventListener("error", () => fail("Paystack script failed"), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = PAYSTACK_INLINE_SRC;
    s.async = true;
    timer = window.setTimeout(() => fail("Paystack script load timed out"), PAYSTACK_SCRIPT_TIMEOUT_MS);
    s.onload = () => {
      clearTimer();
      resolve();
    };
    s.onerror = () => fail("Failed to load Paystack Inline");
    document.body.appendChild(s);
  });
  loadPromise = promise.catch((error) => {
    loadPromise = null;
    throw error;
  });
  return loadPromise;
}

export async function openPaystackInline(opts: PaystackInlineOptions): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await loadPaystackInlineScript();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load Paystack";
    console.error("[TipGuard:pay] Paystack script load failed", e);
    return { ok: false, message };
  }
  const PaystackPop = window.PaystackPop;
  if (!PaystackPop?.setup) {
    const message = "Paystack checkout is not available on this page.";
    console.error("[TipGuard:pay]", message);
    return { ok: false, message };
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
  return { ok: true };
}
