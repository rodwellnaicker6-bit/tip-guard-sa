/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_PAYSTACK_PUBLIC_KEY: string;
  /** Optional override; otherwise derived from `pk_test_` prefix on `VITE_PAYSTACK_PUBLIC_KEY`. */
  readonly VITE_PAYSTACK_TEST_MODE?: string;
  /** Active gateway for `startTipCheckout` (default: paystack). */
  readonly VITE_TIP_PAYMENT_GATEWAY?: string;
  /** Optional Sentry DSN — init stub in src/lib/sentry.ts; add @sentry/react post-MVP */
  readonly VITE_SENTRY_DSN?: string;
  /** Idle logout after N minutes of inactivity; 0 or unset = disabled */
  readonly VITE_SESSION_IDLE_MINUTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
