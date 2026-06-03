/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_PAYSTACK_PUBLIC_KEY: string;
  /** Canonical production app URL for auth callbacks, e.g. https://tipguardsa.co.za. */
  readonly VITE_PUBLIC_APP_URL?: string;
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
  /** Hide Paystack test banner and build fingerprint for polished compliance demos */
  readonly VITE_COMPLIANCE_DEMO_MODE?: string;
  /** Verbose boot logs (also enabled in dev) */
  readonly VITE_DEBUG_BOOT?: string;
  /** Verbose payment invoke logs in browser console */
  readonly VITE_DEBUG_PAY?: string;
  /** Support email on /contact (default support@tipguard.co.za) */
  readonly VITE_SUPPORT_EMAIL?: string;
  /** Registered operator legal name for compliance footer */
  readonly VITE_BUSINESS_LEGAL_NAME?: string;
  /** SA business phone shown on /contact and legal pages */
  readonly VITE_BUSINESS_PHONE?: string;
  readonly VITE_BUSINESS_PHONE_MOBILE?: string;
  /** Physical business address for Paystack / POPIA */
  readonly VITE_BUSINESS_ADDRESS?: string;
}

declare const __BUILD_ID__: string;
declare const __GIT_SHA__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
