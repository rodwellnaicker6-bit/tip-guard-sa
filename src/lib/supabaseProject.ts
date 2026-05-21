/** Normalize Supabase project URL and detect common misconfiguration. */

const KNOWN_TYPO: [wrong: string, correct: string] = ["fyjumjhlqpvfryelnfum", "fyjmujhlqpvfryelnfum"];

export function normalizeSupabaseUrl(url: string): string {
  let u = url.trim().replace(/\/$/, "");
  for (const [wrong, correct] of [KNOWN_TYPO]) {
    if (u.includes(wrong)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[TipGuard] VITE_SUPABASE_URL typo (${wrong}) — using ${correct}. Update .env to avoid DNS failures.`,
        );
      }
      u = u.replace(wrong, correct);
    }
  }
  return u;
}

export function projectRefFromSupabaseUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(host);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}
