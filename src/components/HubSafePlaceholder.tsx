import { Link } from "react-router-dom";

/** Shown inside hub shell when a child route has no data yet — never a blank screen. */
export function HubSafePlaceholder({ title = "Dashboard" }: { title?: string }) {
  return (
    <div className="shell dashboard-hub mx-auto max-w-lg space-y-4 px-4 py-10 text-center sm:px-5">
      <p className="muted-label">{title}</p>
      <p className="text-sm text-slate-400">Content is loading or temporarily unavailable.</p>
      <button
        type="button"
        className="tap-target rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
      <Link to="/" className="block text-sm font-semibold text-amber-400">
        Home
      </Link>
    </div>
  );
}
