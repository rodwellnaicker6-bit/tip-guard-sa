import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="shell mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 px-5 py-12 text-center">
      <p className="text-6xl font-black text-amber-400/80" aria-hidden>
        404
      </p>
      <h1 className="text-xl font-black text-white">Page not found</h1>
      <p className="text-sm text-slate-400">The link may be outdated or the page was moved.</p>
      <Link className="btn-gold tap-target w-full max-w-xs" to="/">
        Back to home
      </Link>
      <Link className="tap-target text-sm text-amber-400" to="/login">
        Sign in
      </Link>
    </div>
  );
}
