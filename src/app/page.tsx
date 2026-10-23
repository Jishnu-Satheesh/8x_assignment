import { EditorialHeader } from "@/components/explore/editorial-header";
import { ExploreCollection } from "@/components/explore/explore-collection";
import { inspiration } from "@/lib/inspiration";

export default function ExplorePage() {
  return (
    <div className="page-content">
      <EditorialHeader />
      <ExploreCollection items={inspiration} />
    </div>
  );
}
