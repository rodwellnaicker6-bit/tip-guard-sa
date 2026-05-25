/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_PAYSTACK_PUBLIC_KEY: string;
  /** Optional override; otherwise derived from `pk_test_` prefix on `VITE_PAYSTACK_PUBLIC_KEY`. */
  readonly VITE_PAYSTACK_TEST_MODE?: string;
  /** Active gateway for `startTipCheckout` (default: paystack). */
  readonly VITE_TIP_PAYMENT_GATEWAY?: string;
  /** Optional Sentry DSN — @sentry/react when set */
  readonly VITE_SENTRY_DSN?: string;
  /** Emergency maintenance screen (Vercel env); unset = normal app */
  readonly VITE_MAINTENANCE_MODE?: string;
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_ENABLE_PUSH?: string;
  /** Idle logout after N minutes of inactivity; 0 or unset = disabled */
  readonly VITE_SESSION_IDLE_MINUTES?: string;
  /** Verbose boot logs (also enabled in dev) */
  readonly VITE_DEBUG_BOOT?: string;
  /** Verbose payment invoke logs in browser console */
  readonly VITE_DEBUG_PAY?: string;
}

declare const __BUILD_ID__: string;
declare const __GIT_SHA__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
