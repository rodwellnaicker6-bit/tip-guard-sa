import { Skeleton } from "./Skeleton";

export default function PageLoader() {
  return (
    <div className="shell stack page-loader" role="status" aria-label="Loading page">
      <Skeleton style={{ height: 28, width: "55%" }} />
      <Skeleton style={{ height: 16, width: "100%" }} />
      <Skeleton style={{ height: 16, width: "85%" }} />
      <div className="stack mt" style={{ gap: 10 }}>
        <Skeleton style={{ height: 52, width: "100%", borderRadius: 16 }} />
        <Skeleton style={{ height: 52, width: "100%", borderRadius: 16 }} />
      </div>
    </div>
  );
}
