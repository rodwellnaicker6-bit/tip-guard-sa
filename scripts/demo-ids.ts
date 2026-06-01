/** Stable IDs for idempotent demo seed / reset (shared; safe to import). */
export const DEMO_IDS = {
  admin: "d1000001-0001-4001-8001-000000000001",
  merchant: "d1000002-0002-4002-8002-000000000002",
  guard: "d1000003-0003-4003-8003-000000000003",
  customer: "d1000004-0004-4004-8004-000000000004",
  merchantRow: "b1000001-0001-4001-8001-000000000001",
  locationRow: "b1000002-0002-4002-8002-000000000002",
  guardRow: "b1000003-0003-4003-8003-000000000003",
  qrToken: "demo-staging-qr-01",
} as const;
