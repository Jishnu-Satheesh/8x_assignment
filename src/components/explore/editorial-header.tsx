import {
  ArrowDown,
  ArrowUpRight,
  Clapperboard,
  ImagePlus,
  Search,
  Sun,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InspirationImage } from "./inspiration-image";

export function EditorialHeader() {
  return (
    <>
      <section className="editorial-hero" aria-labelledby="explore-title">
        {/* One URL for the compressed 68 KB hero avoids responsive preload churn. */}
        <div className="hero-art">
          <InspirationImage
            src="/images/desert.webp"
            alt="Soft golden light tracing the sculptural ridges of desert dunes"
            sizes="(min-width: 1024px) 85vw, 100vw"
            priority
            unoptimized
          />
        </div>
        <div className="hero-scrim" />
        <div className="hero-content">
          <span className="eyebrow">A little inspiration</span>
          <h1 id="explore-title">
            Less searching.
            <br />
            More imagining.
          </h1>
          <p>
            A few good starting points for your next creative leap. Find a mood,
            follow a feeling, make it yours.
          </p>
          <Button asChild className="hero-cta">
            <a href="#inspiration">
              Browse inspiration
              <ArrowDown aria-hidden="true" />
            </a>
          </Button>
        </div>
        <span className="hero-caption">
          <Sun aria-hidden="true" />A study in light &amp; possibility
        </span>
      </section>
      <section
        className="intent-grid"
        aria-label="Choose your creative starting point"
      >
        <a href="#inspiration" className="intent-card intent-discover">
          <span className="intent-icon">
            <Search aria-hidden="true" />
          </span>
          <ArrowUpRight className="intent-arrow" aria-hidden="true" />
          <div>
            <h2>Find a visual direction</h2>
            <p>A little inspiration goes a long way.</p>
          </div>
        </a>
        <article className="intent-card">
          <span className="intent-icon">
            <ImagePlus aria-hidden="true" />
          </span>
          <div>
            <h2>Create an image</h2>
            <div className="intent-meta">
              <p>Image Studio</p>
              <Badge variant="outline" className="intent-badge">
                Next phase
              </Badge>
            </div>
          </div>
        </article>
        <article className="intent-card">
          <span className="intent-icon">
            <Clapperboard aria-hidden="true" />
          </span>
          <div>
            <h2>Think in scenes</h2>
            <div className="intent-meta">
              <p>Cinematic Studio</p>
              <Badge variant="outline" className="intent-badge">
                Soon
              </Badge>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
