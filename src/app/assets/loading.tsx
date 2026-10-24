import { Skeleton } from "@/components/ui/skeleton";
import "../assets.css";

export default function AssetsLoading() {
  return <div className="page-content assets-page" aria-busy="true" aria-label="Loading your images">
    <h1>My Assets</h1>
    <div className="assets-grid assets-loading" aria-hidden="true">
      {[0, 1, 2].map(i => <Skeleton key={i} className="asset-skeleton" />)}
    </div>
  </div>;
}
