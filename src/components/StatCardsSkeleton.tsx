import { Skeleton } from "./Skeleton";

/** Two-up stat card placeholders for dashboard hubs. */
export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-busy="true" aria-label="Loading stats">
      <Skeleton style={{ height: 72, width: "100%", borderRadius: 20 }} />
      <Skeleton style={{ height: 72, width: "100%", borderRadius: 20 }} />
    </div>
  );
}
