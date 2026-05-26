import { Component, type ErrorInfo, type ReactNode } from "react";

/** Minimal visible fallback when a route shell crashes (emergency stability). */
export function EmergencySafeFallback() {
  return (
    <div
      className="shell mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-3 px-5 py-12 text-center"
      style={{ color: "white" }}
    >
      <p className="text-lg font-bold">APP SAFE MODE</p>
      <p className="text-sm text-slate-400">This screen hit an error. Reload or go home.</p>
      <button
        type="button"
        className="rounded-2xl border border-white/15 px-4 py-3 font-semibold"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
      <a href="/" className="text-sm font-semibold text-amber-400">
        Home
      </a>
    </div>
  );
}

type BoundaryProps = { children: ReactNode };

type BoundaryState = { crashed: boolean };

/** Per-route error boundary — never leaves a black screen. */
export class EmergencyErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { crashed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[TipGuard] EmergencyErrorBoundary", error.message, info.componentStack);
  }

  render() {
    if (this.state.crashed) return <EmergencySafeFallback />;
    return this.props.children;
  }
}
