/**
 * Production deploy fingerprint (no secrets).
 * GET /api/debug-env
 */
export default function handler(
  _req: { method?: string },
  res: {
    setHeader: (name: string, value: string) => void;
    status: (code: number) => { json: (body: unknown) => void };
  },
): void {
  // Vercel runtime provides `process.env`, but some TS configs don't include Node types.
  const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

  const supabaseUrl = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "").trim();
  const base = supabaseUrl.replace(/\/$/, "");
  const invokeUrl = base ? `${base}/functions/v1/paystack-initialize` : "";
  const pk = (env.VITE_PAYSTACK_PUBLIC_KEY ?? "").trim();
  const mode = pk.startsWith("pk_live_")
    ? "live"
    : pk.startsWith("pk_test_")
      ? "test"
      : pk
        ? "unknown"
        : "unset";

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    buildId: env.BUILD_ID ?? env.VERCEL_DEPLOYMENT_ID ?? "unknown",
    gitSha: env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercelEnv: env.VERCEL_ENV ?? null,
    deploymentId: env.VERCEL_DEPLOYMENT_ID ?? null,
    supabaseUrl: base || null,
    invokeUrl: invokeUrl || null,
    mode,
    paymentParserMarker: "edgeFunctionInvoke-v1",
    hasPaystackPublicKey: Boolean(pk),
    timestamp: new Date().toISOString(),
  });
}
