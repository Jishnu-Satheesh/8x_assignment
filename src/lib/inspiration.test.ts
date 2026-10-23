import assert from "node:assert/strict";
import { test } from "node:test";
import { filterInspiration, type Inspiration } from "./inspiration.ts";

const items: Inspiration[] = [
  { id: "dune", title: "Dune studies", category: "Cinematic", description: "Sculptural sand at dusk.", image: "/images/desert.webp", alt: "Sunlit desert dunes", tags: ["desert", "warm"], lighting: "Warm side light", composition: "Wide horizon", palette: "Ochre and shadow", source: "https://images.unsplash.com/photo-1542401886-65d6c61db217" },
  { id: "glass", title: "Quiet luxury", category: "Product", description: "A perfume still life.", image: "/images/perfume.webp", alt: "Glass perfume bottle", tags: ["glass", "minimal"], lighting: "Soft window light", composition: "Centered bottle", palette: "Blush and ivory", source: "https://images.unsplash.com/photo-1541643600914-78b084683601" },
];

test("search ignores case and repeated whitespace and matches words across style fields", () => {
  assert.deepEqual(filterInspiration(items, { query: "  WARM  horizon \n", category: "All" }).map(item => item.id), ["dune"]);
});

test("category and search intersect instead of returning unrelated matches", () => {
  assert.deepEqual(filterInspiration(items, { query: "light", category: "Product" }).map(item => item.id), ["glass"]);
  assert.deepEqual(filterInspiration(items, { query: "desert", category: "Product" }), []);
});

test("clearing search and category restores the complete ordered collection without mutation", () => {
  const before = structuredClone(items);
  assert.deepEqual(filterInspiration(items, { query: " \n ", category: "All" }).map(item => item.id), ["dune", "glass"]);
  assert.deepEqual(items, before);
});

test("unknown queries and empty collections produce no results", () => {
  assert.deepEqual(filterInspiration(items, { query: "impossible-subject", category: "All" }), []);
  assert.deepEqual(filterInspiration([], { query: "", category: "All" }), []);
});
