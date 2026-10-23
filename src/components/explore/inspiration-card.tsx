"use client";

import { ArrowUpRight, ExternalLink, Palette, Scan, Sun } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Inspiration } from "@/lib/inspiration";
import { InspirationImage } from "./inspiration-image";

export function InspirationCard({ item }: { item: Inspiration }) {
  return (
    <article className="inspiration-card">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="inspiration-trigger"
            aria-label={`${item.title} ${item.category} — Preview`}
          >
            <div className="card-image">
              <InspirationImage
                src={item.image}
                alt={item.alt}
                sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
              />
              <span className="preview-indicator" aria-hidden="true">
                <ArrowUpRight />
              </span>
            </div>
            <div className="card-caption">
              <div>
                <h3>{item.title}</h3>{" "}
                <p className="card-category">{item.category}</p>
              </div>
              <ArrowUpRight aria-hidden="true" />
            </div>
          </button>
        </DialogTrigger>
        <DialogContent className="preview-dialog">
          <div className="preview-image">
            <InspirationImage
              src={item.image}
              alt={item.alt}
              sizes="(min-width: 768px) 440px, 100vw"
            />
          </div>
          <div className="preview-details">
            <DialogHeader>
              <span className="preview-category">
                {item.category} inspiration
              </span>
              <DialogTitle>{item.title}</DialogTitle>
              <DialogDescription>{item.description}</DialogDescription>
            </DialogHeader>
            <dl className="style-facts">
              <div>
                <dt>
                  <Sun aria-hidden="true" />
                  Light &amp; mood
                </dt>
                <dd>{item.lighting}</dd>
              </div>
              <div>
                <dt>
                  <Scan aria-hidden="true" />
                  Composition
                </dt>
                <dd>{item.composition}</dd>
              </div>
              <div>
                <dt>
                  <Palette aria-hidden="true" />
                  Color story
                </dt>
                <dd>{item.palette}</dd>
              </div>
            </dl>
            <p className="preview-note">
              <strong>A direction to explore</strong>This is source photography
              with creative notes, ready to spark an idea. Image generation
              arrives with Image Studio in the next phase.
            </p>
            <p className="preview-credit">
              <span>Photography via Unsplash</span>
              <span aria-hidden="true">·</span>
              <a href={item.source} target="_blank" rel="noreferrer">
                View source
                <ExternalLink aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
