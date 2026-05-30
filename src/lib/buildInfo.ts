/** Injected at build time via Vite `define` (see vite.config.ts). */
declare const __BUILD_ID__: string;

export const BUILD_ID =
  typeof __BUILD_ID__ !== "undefined" && __BUILD_ID__ ? __BUILD_ID__ : "dev-local";

/** True when payment error parser + pay logging shipped (grep marker for prod verification). */
export const PAYMENT_PARSER_MARKER = "edgeFunctionInvoke-v1";
