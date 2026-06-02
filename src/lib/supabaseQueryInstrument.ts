/**
 * Runtime Supabase query instrumentation — logs duration, rows, errors, timeouts.
 * Enable: DEV or VITE_SUPABASE_QUERY_TRACE=1 (disable with VITE_SUPABASE_QUERY_TRACE=0).
 */

export type SupabaseQueryTrace = {
  queryName: string;
  page: string | null;
  startTime: number;
  endTime: number;
  durationMs: number;
  rowsReturned: number | null;
  error: string | null;
  timeout: boolean;
};

const SLOW_MS = 3_000;
const LARGE_ROW_WARN = 500;

export const SUPABASE_QUERY_TIMEOUT_MS = 10_000;

const traces: SupabaseQueryTrace[] = [];
let activePage: string | null = null;

export function isSupabaseQueryTraceEnabled(): boolean {
  const flag = import.meta.env.VITE_SUPABASE_QUERY_TRACE;
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return import.meta.env.DEV;
}

export function setSupabaseQueryPage(page: string | null): void {
  activePage = page;
}

export function getSupabaseQueryTraces(): SupabaseQueryTrace[] {
  return [...traces];
}

export function clearSupabaseQueryTraces(): void {
  traces.length = 0;
}

/** Hard timeout for hung PostgREST / RPC promises. */
export function withSupabaseQueryTimeout<T>(
  promise: PromiseLike<T>,
  ms: number = SUPABASE_QUERY_TIMEOUT_MS,
): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    }),
  ]);
}

function countRows(data: unknown): number | null {
  if (data == null) return 0;
  if (Array.isArray(data)) return data.length;
  if (typeof data === "object") return 1;
  return null;
}

function logQueryTrace(trace: SupabaseQueryTrace): void {
  const pageLine = trace.page ? `page: ${trace.page}\n` : "";
  console.info(
    `[QUERY]\n${pageLine}name: ${trace.queryName}\nduration: ${trace.durationMs}ms\nrows: ${trace.rowsReturned ?? "—"}\nerror: ${trace.error ?? "—"}\ntimedOut: ${trace.timeout ? "yes" : "no"}`,
  );
  if (trace.durationMs >= SLOW_MS) {
    console.warn(`[QUERY SLOW] ${trace.queryName} took ${trace.durationMs}ms (page=${trace.page ?? "—"})`);
  }
  if (trace.rowsReturned != null && trace.rowsReturned > LARGE_ROW_WARN) {
    console.warn(
      `[QUERY LARGE] ${trace.queryName} returned ${trace.rowsReturned} rows (page=${trace.page ?? "—"})`,
    );
  }
  if (/\.select\([^)]*\*[^)]*\)/.test(trace.queryName) || trace.queryName.includes(".select(*)")) {
    console.warn(`[QUERY NESTED/WIDE SELECT] ${trace.queryName}`);
  }
}

function recordTrace(partial: Omit<SupabaseQueryTrace, "startTime" | "endTime" | "durationMs"> & { durationMs: number; startTime: number; endTime: number }): void {
  const trace: SupabaseQueryTrace = { ...partial };
  traces.push(trace);
  if (traces.length > 400) traces.splice(0, traces.length - 400);
  logQueryTrace(trace);
}

export async function traceSupabaseQuery<T>(
  queryName: string,
  run: () => PromiseLike<T>,
  options?: { timeoutMs?: number; skipTimeout?: boolean },
): Promise<T> {
  const startTime = performance.now();
  let rowsReturned: number | null = null;
  let error: string | null = null;
  let timeout = false;

  try {
    const raw = run();
    const result = options?.skipTimeout
      ? await Promise.resolve(raw)
      : await withSupabaseQueryTimeout(raw, options?.timeoutMs ?? SUPABASE_QUERY_TIMEOUT_MS);

    const maybe = result as { data?: unknown; error?: { message?: string } | null };
    if (maybe && typeof maybe === "object" && "data" in maybe) {
      rowsReturned = countRows(maybe.data);
      error = maybe.error?.message ?? null;
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error = msg;
    timeout = /timeout/i.test(msg);
    throw e;
  } finally {
    const endTime = performance.now();
    recordTrace({
      queryName,
      page: activePage,
      startTime,
      endTime,
      durationMs: Math.round(endTime - startTime),
      rowsReturned,
      error,
      timeout,
    });
  }
}

/** Page report for runtime investigation. */
export function printSupabaseQueryPageReport(page: string): void {
  const pageTraces = traces.filter((t) => t.page === page);
  console.info(`[QUERY REPORT] page=${page} count=${pageTraces.length}`);
  for (const t of pageTraces) {
    console.info(
      `  • ${t.queryName} | ${t.durationMs}ms | rows=${t.rowsReturned ?? "—"} | error=${t.error ?? "—"} | timeout=${t.timeout}`,
    );
  }
}

type Thenable = {
  then: (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

function isThenable(v: unknown): v is Thenable {
  return Boolean(v && typeof (v as Thenable).then === "function");
}

/** Wrap PostgREST builder so the executed promise is traced + timeout-bounded. */
export function wrapPostgrestBuilder<T extends object>(builder: T, queryName: string): T {
  if (!isSupabaseQueryTraceEnabled()) return builder;

  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === "then" && typeof value === "function") {
        return (
          onfulfilled?: ((v: unknown) => unknown) | null,
          onrejected?: ((e: unknown) => unknown) | null,
        ) =>
          traceSupabaseQuery(queryName, () =>
            new Promise((resolve, reject) => {
              (value as Thenable["then"]).call(target, resolve, reject);
            }),
          ).then(onfulfilled ?? undefined, onrejected ?? undefined);
      }
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const next = (value as (...a: unknown[]) => unknown).apply(target, args);
          if (isThenable(next)) {
            let nextName = `${queryName}.${String(prop)}`;
            if (prop === "select" && typeof args[0] === "string") {
              const sel = (args[0] as string).replace(/\s+/g, "");
              nextName = `${queryName}.select(${sel.length > 96 ? `${sel.slice(0, 96)}…` : sel})`;
            }
            return wrapPostgrestBuilder(next, nextName);
          }
          return next;
        };
      }
      return value;
    },
  }) as T;
}

declare global {
  interface Window {
    __tipguardQueryTraces?: () => SupabaseQueryTrace[];
    __tipguardQueryReport?: (page: string) => void;
  }
}

if (typeof window !== "undefined" && isSupabaseQueryTraceEnabled()) {
  window.__tipguardQueryTraces = getSupabaseQueryTraces;
  window.__tipguardQueryReport = printSupabaseQueryPageReport;
}
