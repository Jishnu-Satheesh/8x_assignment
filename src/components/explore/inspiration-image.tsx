"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function InspirationImage({
  src,
  alt,
  sizes,
  priority = false,
  unoptimized = false,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  unoptimized?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed)
    return (
      <div
        className="image-failed"
        role="img"
        aria-label={`${alt}. Image unavailable.`}
      >
        <ImageOff aria-hidden="true" />
        <span>Image unavailable</span>
      </div>
    );

  return (
    <div className={cn("absolute inset-0", loaded && "image-loaded")}>
      <div className="image-loading" aria-hidden="true" />
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        unoptimized={unoptimized}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        className="image-layer"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
