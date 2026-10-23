"use client";

import { useState } from "react";
import { Aperture, Images, Search, SearchX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  categories,
  filterInspiration,
  type CategoryFilter,
  type Inspiration,
} from "@/lib/inspiration";
import { InspirationCard } from "./inspiration-card";

export function ExploreCollection({
  items,
}: {
  items: readonly Inspiration[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All");
  const results = filterInspiration(items, { query, category });
  const reset = () => {
    setQuery("");
    setCategory("All");
  };

  return (
    <section className="collection" aria-labelledby="inspiration">
      <div className="collection-header">
        <div className="collection-heading">
          <h2 id="inspiration" tabIndex={-1}>
            Curated inspiration
          </h2>
          <p className="supporting">
            Good starting points. Room for your own spin.
          </p>
        </div>
        <div className="search-field">
          <label htmlFor="inspiration-search" className="sr-only">
            Search inspiration
          </label>
          <Search className="search-icon" aria-hidden="true" />
          <Input
            id="inspiration-search"
            type="search"
            placeholder="Search a mood, style, or idea…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="clear-search"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="filter-row">
        <div
          className="category-filters"
          role="group"
          aria-label="Filter inspiration by category"
        >
          {categories.map((value) => (
            <button
              className="category-filter"
              type="button"
              key={value}
              aria-pressed={value === category}
              onClick={() => setCategory(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <p
          className="result-count"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {results.length} {results.length === 1 ? "direction" : "directions"}
          {query || category !== "All" ? " found" : " to explore"}
        </p>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          <Images aria-hidden="true" />
          <h3>The collection is taking shape</h3>
          <p>
            There are no visual directions in this collection yet. Check back
            for a little inspiration.
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="empty-state">
          <SearchX aria-hidden="true" />
          <h3>No directions found</h3>
          <p>
            Try another mood, subject, or style, or start fresh with the full
            collection.
          </p>
          <Button onClick={reset}>Clear search &amp; filters</Button>
        </div>
      ) : (
        <div className="inspiration-grid">
          {results.map((item) => (
            <InspirationCard key={item.id} item={item} />
          ))}
        </div>
      )}
      <footer className="collection-footer">
        <span>
          <Aperture aria-hidden="true" />A small collection. Endless
          possibilities.
        </span>
        <p>Source photography · Thoughtful creative direction</p>
      </footer>
    </section>
  );
}
