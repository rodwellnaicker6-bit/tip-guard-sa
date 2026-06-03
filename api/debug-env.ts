/**
 * Deploy fingerprint — disabled on production (Paystack review / security).
 * GET /api/debug-env → 404 when VERCEL_ENV=production.
 * Non-production: minimal JSON without secrets (no raw keys).
 */
export default function handler(
  _req: { method?: string },
  res: {
    setHeader: (name: string, value: string) => void;
    status: (code: number) => { json: (body: unknown) => void; end?: () => void };
  },
): void {
  const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env ?? {};

  const vercelEnv = (env.VERCEL_ENV ?? "").trim();

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (vercelEnv === "production") {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const pk = (env.VITE_PAYSTACK_PUBLIC_KEY ?? "").trim();
  const mode = pk.startsWith("pk_live_")
    ? "live"
    : pk.startsWith("pk_test_")
      ? "test"
      : pk
        ? "unknown"
        : "unset";

  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    vercelEnv: vercelEnv || null,
    mode,
    hasPaystackPublicKey: Boolean(pk),
    timestamp: new Date().toISOString(),
  });
}
