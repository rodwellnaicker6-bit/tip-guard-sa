import { createClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const rawAnon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** Detects unedited `.env.example` values so we do not treat them as a real project. */
export function looksLikePlaceholderSupabaseEnv(url: string, anonKey: string): boolean {
  const u = url.trim().toLowerCase();
  const a = anonKey.trim().toLowerCase();
  if (a === "your_anon_key" || a === "changeme" || a === "replace_me") return true;
  if (a.startsWith("sb_publishable_")) return false;
  if (u.includes("your_project_ref")) return true;
  if (u.includes("your-project-ref")) return true;
  if (u.includes("xxxxx.supabase.co")) return true;
  if (u.includes("example.supabase.co")) return true;
  return false;
}

export type SupabaseBrowserConfigIssue = "missing" | "placeholder";

/** Why the browser client is not wired to a real project (null = OK). */
export function getSupabaseBrowserConfigIssue(): SupabaseBrowserConfigIssue | null {
  if (!rawUrl || !rawAnon) return "missing";
  if (looksLikePlaceholderSupabaseEnv(rawUrl, rawAnon)) return "placeholder";
  return null;
}

/** True when real project URL + anon key are set (not missing, not template placeholders). */
export const isSupabaseBrowserConfigured = getSupabaseBrowserConfigIssue() === null;

if (!isSupabaseBrowserConfigured) {
  const issue = getSupabaseBrowserConfigIssue();
  if (issue === "placeholder") {
    console.warn(
      import.meta.env.DEV
        ? "TipGuard: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY look like .env.example placeholders — replace them with your project URL and anon key from the Supabase Dashboard (Settings → API)."
        : "TipGuard: Supabase URL/key look like template placeholders — set real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for production.",
    );
  } else {
    console.warn(
      import.meta.env.DEV
        ? "TipGuard: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — auth and data will not work until configured (see .env.example)."
        : "TipGuard: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — auth and data will not work until configured.",
    );
  }
}

/** Local Supabase CLI default; used only when env vars are missing so createClient does not throw. */
export const SUPABASE_LOCAL_PLACEHOLDER_URL = "http://127.0.0.1:54321";

/** Valid-shaped placeholders so createClient does not throw; real values come from `.env`. */
const resolvedUrl = rawUrl || SUPABASE_LOCAL_PLACEHOLDER_URL;
const resolvedAnon =
  rawAnon ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const supabase = createClient(resolvedUrl, resolvedAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Dev-only: log resolved host (no secrets). Restart `npm run dev` after .env changes. */
if (import.meta.env.DEV && isSupabaseBrowserConfigured) {
  try {
    const host = new URL(resolvedUrl).host;
    console.info(`[TipGuard] Supabase → ${host}`);
  } catch {
    console.warn("[TipGuard] VITE_SUPABASE_URL is not a valid URL");
  }
}
