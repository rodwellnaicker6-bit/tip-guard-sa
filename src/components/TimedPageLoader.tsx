import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageLoader from "./PageLoader";

const DEFAULT_TIMEOUT_MS = 4_500;

type Props = {
  label?: string;
  timeoutMs?: number;
};

/** Skeleton loader with fallback so routes never spin forever. */
export function TimedPageLoader({ label = "Loading…", timeoutMs = DEFAULT_TIMEOUT_MS }: Props) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(t);
  }, [timeoutMs]);

  if (timedOut) {
    return (
      <div className="shell mx-auto max-w-lg space-y-4 px-5 py-10 text-center">
        <p className="text-lg font-bold text-white">Taking longer than expected</p>
        <p className="text-sm text-slate-400">{label}</p>
        <button
          type="button"
          className="tap-target rounded-2xl border border-white/15 px-4 py-3 font-semibold text-white"
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

  return <PageLoader />;
}
