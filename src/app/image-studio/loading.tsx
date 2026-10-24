import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return <div className="studio-loading" role="status" aria-label="Loading Image Studio"><Skeleton className="studio-loading-controls" /><Skeleton className="studio-loading-viewer" /><span className="sr-only">Loading Image Studio</span></div>;
}
