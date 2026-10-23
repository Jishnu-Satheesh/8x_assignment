import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      className="page-content loading-page"
      role="status"
      aria-label="Loading Explore"
    >
      <span className="sr-only">Loading inspiration…</span>
      <Skeleton className="loading-hero" />
      <div className="intent-grid">
        {[1, 2, 3].map((item) => (
          <Skeleton key={item} className="loading-intent" />
        ))}
      </div>
      <Skeleton className="loading-title" />
      <div className="inspiration-grid">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="loading-image" />
        ))}
      </div>
    </div>
  );
}
