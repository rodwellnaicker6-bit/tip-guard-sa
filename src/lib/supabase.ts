import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { reconcileSupabaseAuthStorage } from "./supabaseAuthStorage";
import { normalizeSupabaseUrl, projectRefFromSupabaseUrl } from "./supabaseProject";

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

const DEMO_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

function resolveSupabaseCredentials(): { url: string; anon: string; storageKey: string } {
  const url =
    isSupabaseBrowserConfigured && rawUrl
      ? normalizeSupabaseUrl(rawUrl)
      : rawUrl || SUPABASE_LOCAL_PLACEHOLDER_URL;
  const anon = rawAnon || DEMO_ANON;
  const projectRef = projectRefFromSupabaseUrl(url);
  const storageKey = projectRef ? `tipguard-${projectRef}-auth` : "tipguard-auth";
  return { url, anon, storageKey };
}

let supabaseSingleton: SupabaseClient | null = null;

function createSupabaseBrowserClient(): SupabaseClient {
  const { url, anon, storageKey } = resolveSupabaseCredentials();
  if (isSupabaseBrowserConfigured) {
    try {
      reconcileSupabaseAuthStorage(url);
    } catch (e) {
      console.error("[TipGuard] reconcileSupabaseAuthStorage failed", e);
    }
  }
  try {
    return createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey,
      },
    });
  } catch (e) {
    console.error("[TipGuard] createClient failed — using safe local placeholder", e);
    return createClient(SUPABASE_LOCAL_PLACEHOLDER_URL, DEMO_ANON, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "tipguard-auth-fallback",
      },
    });
  }
}

/** Single browser Supabase client — lazy init; never throws at module import. */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseSingleton) {
    supabaseSingleton = createSupabaseBrowserClient();
    if (import.meta.env.DEV && isSupabaseBrowserConfigured) {
      try {
        const { url } = resolveSupabaseCredentials();
        const host = new URL(url).host;
        console.info(`[TipGuard] Supabase → ${host}`);
      } catch {
        console.warn("[TipGuard] VITE_SUPABASE_URL is not a valid URL");
      }
    }
  }
  return supabaseSingleton;
}

/** Lazy proxy so importing `supabase` does not eagerly call createClient. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
