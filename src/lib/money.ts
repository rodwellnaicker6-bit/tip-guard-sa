export function zarFromCents(cents: number): string {
  return `R ${(cents / 100).toFixed(2)}`;
}

export function centsFromRandInput(value: string): number | null {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
