/** Normalize PostgREST / RPC payloads that may return a row, a single-element array, or a scalar. */
export function unwrapRpcSingle<T>(data: unknown): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    const first = data[0];
    return first != null ? (first as T) : null;
  }
  return data as T;
}
