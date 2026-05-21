import { Link } from "react-router-dom";

/** Mobile-first floating actions — wallet-style. */
export function CustomerFab() {
  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex justify-end px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      aria-label="Quick actions"
    >
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        <Link
          to="/customer/wallet"
          className="flex h-11 min-w-[5.5rem] items-center justify-center rounded-2xl border border-white/15 bg-slate-950/90 px-3 text-xs font-bold uppercase tracking-wide text-amber-200 shadow-lg backdrop-blur-md transition active:scale-95"
        >
          Wallet
        </Link>
        <Link
          to="/customer/dashboard"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-sm font-black text-black shadow-xl shadow-amber-500/40 transition active:scale-95"
          title="Dashboard"
        >
          Hub
        </Link>
      </div>
    </div>
  );
}
