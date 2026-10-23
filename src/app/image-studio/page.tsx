import type { Metadata } from "next";
import { ImageStudio } from "@/components/studio/image-studio";
import { configuration } from "@/lib/studio/durable/availability";
import "../studio.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Image Studio — Higgsfield creative workspace", description: "Turn a visual idea into an image with Gemini." };
export default function ImageStudioPage() { return <ImageStudio availability={configuration()} />; }
