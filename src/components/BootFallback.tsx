import type { ReactNode } from "react";

function BootPanel({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="shell stack min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <h1 className="text-xl font-bold text-amber-400">{title}</h1>
      <p className="text-sm text-slate-400">{message}</p>
      {children}
    </div>
  );
}

export function BootLoadingFallback() {
  return (
    <BootPanel
      title="Loading app…"
      message="TipGuard is starting. If this screen stays longer than a few seconds, reload or check your connection."
    >
      <button
        type="button"
        className="rounded-2xl border border-white/15 px-4 py-3 font-semibold text-slate-200"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </BootPanel>
  );
}

export function SupabaseInitFailedFallback({ detail }: { detail?: string }) {
  return (
    <BootPanel
      title="Supabase init failed"
      message="Authentication and data could not start. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment, then redeploy."
    >
      {detail ? (
        <pre className="max-h-32 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-red-300">
          {detail}
        </pre>
      ) : null}
      <button
        type="button"
        className="rounded-2xl border border-white/15 px-4 py-3 font-semibold text-slate-200"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </BootPanel>
  );
}

export function AuthBootFailedFallback({ message }: { message: string }) {
  return (
    <BootPanel
      title="Auth failed"
      message={message}
    >
      <a href="/login" className="rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 px-4 py-3 text-center font-bold text-black">
        Go to sign in
      </a>
      <button
        type="button"
        className="rounded-2xl border border-white/15 px-4 py-3 font-semibold text-slate-200"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </BootPanel>
  );
}
