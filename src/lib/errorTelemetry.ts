import { prodError } from "./prodLog";

type ErrorSample = {
  channel: string;
  code?: string;
  route: string;
  at: number;
  message: string;
};

const MAX_SAMPLES = 100;
const samples: ErrorSample[] = [];

function currentRoute(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.location.pathname;
  } catch {
    return "";
  }
}

/** Central error channel — route + code only, no PII. Always logs via prodError. */
export function recordError(
  channel: string,
  message: string,
  meta?: { code?: string; route?: string },
): void {
  const sample: ErrorSample = {
    channel,
    code: meta?.code,
    route: meta?.route ?? currentRoute(),
    at: Date.now(),
    message: message.slice(0, 200),
  };
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.shift();
  prodError(`[TipGuard:error] ${channel}`, {
    code: sample.code,
    route: sample.route,
    message: sample.message,
  });
}

export function getErrorSnapshot(): {
  count: number;
  recent: ErrorSample[];
  byChannel: Record<string, number>;
} {
  const byChannel: Record<string, number> = {};
  for (const s of samples) {
    byChannel[s.channel] = (byChannel[s.channel] ?? 0) + 1;
  }
  return {
    count: samples.length,
    recent: samples.slice(-20),
    byChannel,
  };
}

export function attachErrorTelemetryGlobal(): void {
  if (typeof window === "undefined") return;
  (window as Window & { __TIPGUARD_ERRORS__?: typeof getErrorSnapshot }).__TIPGUARD_ERRORS__ =
    getErrorSnapshot;
}

export function installUnhandledRejectionCapture(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("unhandledrejection", (ev) => {
    const msg =
      ev.reason instanceof Error
        ? ev.reason.message
        : typeof ev.reason === "string"
          ? ev.reason
          : "Unhandled promise rejection";
    recordError("unhandledrejection", msg);
  });
}
