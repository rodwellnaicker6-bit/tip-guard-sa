/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_PAYSTACK_PUBLIC_KEY: string;
  /** Optional override; otherwise derived from `pk_test_` prefix on `VITE_PAYSTACK_PUBLIC_KEY`. */
  readonly VITE_PAYSTACK_TEST_MODE?: string;
  /** Active gateway for `startTipCheckout` (default: paystack). */
  readonly VITE_TIP_PAYMENT_GATEWAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
