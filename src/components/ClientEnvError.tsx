type Props = {
  message: string;
  missing: string[];
};

/** Shown when production client env fails validation — avoids blank screen before React app mounts. */
export function ClientEnvError({ message, missing }: Props) {
  return (
    <div className="shell stack min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <h1 className="text-xl font-bold text-amber-400">TipGuard needs configuration</h1>
      <p className="text-sm text-slate-400">
        This deployment is missing or has invalid environment variables. Add them in the Vercel project
        settings (or your host&apos;s env UI), then redeploy.
      </p>
      <p className="text-sm text-red-300">{message}</p>
      {missing.length > 0 && (
        <ul className="list-inside list-disc text-sm text-slate-300">
          {missing.map((name) => (
            <li key={name}>
              <code className="text-amber-200">{name}</code>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        See <code className="text-slate-400">.env.example</code> and <code className="text-slate-400">DEPLOY.md</code>{" "}
        in the repo. Never put secret keys (<code className="text-slate-400">sk_*</code>, service role) in{" "}
        <code className="text-slate-400">VITE_*</code> variables.
      </p>
      <button
        type="button"
        className="rounded-2xl border border-white/15 px-4 py-3 font-semibold text-slate-200"
        onClick={() => window.location.reload()}
      >
        Reload after updating env
      </button>
    </div>
  );
}
