import type { Metadata } from "next";
import { AssetLibrary } from "@/components/assets/asset-library";
import "../assets.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Assets — Higgsfield creative workspace",
  description: "Your private generated images and their original creative direction.",
};

export default function AssetsPage() {
  return <AssetLibrary />;
}
