import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException } from "../lib/sentry";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[TipGuard] ErrorBoundary", error.message, import.meta.env.DEV ? info.componentStack : "");
    captureException(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="shell stack min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
          <h1 className="text-xl font-bold text-amber-400" style={{ color: "white" }}>
            APP SAFE MODE
          </h1>
          <p className="text-sm text-slate-400">Something went wrong. Reload the page or go home.</p>
          <pre className="max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-red-300">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 px-4 py-3 font-bold text-black"
            onClick={() => window.location.assign("/")}
          >
            Go home
          </button>
          <button
            type="button"
            className="rounded-2xl border border-white/15 px-4 py-3 font-semibold text-slate-200"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
