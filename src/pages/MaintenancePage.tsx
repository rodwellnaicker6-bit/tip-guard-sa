import { Link } from "react-router-dom";
import { TipGuardLogo } from "../components/TipGuardLogo";

/** Shown when VITE_MAINTENANCE_MODE=true (Vercel env). Legal/static routes may still be linked. */
export default function MaintenancePage() {
  return (
    <div className="shell mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center gap-6 px-5 py-12 text-center">
      <TipGuardLogo className="h-10 w-auto" />
      <div className="space-y-2">
        <h1 className="text-2xl font-black text-white">Scheduled maintenance</h1>
        <p className="text-sm leading-relaxed text-slate-400">
          TipGuard is temporarily unavailable while we upgrade systems. Tipping and payouts will resume shortly.
          Thank you for your patience.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3 text-sm">
        <Link className="font-semibold text-amber-400 hover:underline" to="/terms">
          Terms
        </Link>
        <Link className="font-semibold text-amber-400 hover:underline" to="/privacy">
          Privacy
        </Link>
      </div>
    </div>
  );
}
