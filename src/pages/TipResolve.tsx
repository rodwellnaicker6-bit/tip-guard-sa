import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

/** Legacy `/t/:token` — forwards to mobile QR landing at `/tip/:token`. */
export default function TipResolve() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    const qs = window.location.search;
    navigate(`/tip/${encodeURIComponent(token)}${qs}`, { replace: true });
  }, [token, navigate]);

  if (!token) {
    return (
      <div className="shell mx-auto max-w-md px-5 py-10 text-center">
        <h2 className="text-xl font-bold text-white">Tip link</h2>
        <div className="error mt-2">Missing tip link.</div>
        <Link to="/customer" className="mt-4 inline-block text-amber-400">
          Browse guards
        </Link>
      </div>
    );
  }

  return (
    <div className="shell mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-4 px-5 py-16 text-center">
      <div className="h-12 w-12 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
      <h2 className="text-lg font-bold text-white">Opening tip…</h2>
      <p className="text-sm text-slate-400">Redirecting to the secure tip page…</p>
    </div>
  );
}
