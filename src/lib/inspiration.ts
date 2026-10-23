export const categories = [
  "All",
  "Cinematic",
  "Editorial",
  "Product",
  "Abstract",
  "Architecture",
] as const;
export type CategoryFilter = (typeof categories)[number];

export type Inspiration = {
  id: string;
  title: string;
  category: Exclude<CategoryFilter, "All">;
  description: string;
  image: string;
  alt: string;
  tags: readonly string[];
  lighting: string;
  composition: string;
  palette: string;
  source: string;
};

export function filterInspiration(
  items: readonly Inspiration[],
  filters: { query: string; category: CategoryFilter },
): Inspiration[] {
  const terms = filters.query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return items.filter((item) => {
    if (filters.category !== "All" && item.category !== filters.category)
      return false;
    const text = [
      item.title,
      item.category,
      item.description,
      ...item.tags,
      item.lighting,
      item.composition,
      item.palette,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export const inspiration: readonly Inspiration[] = [
  {
    id: "dune-studies",
    title: "Dune studies",
    category: "Cinematic",
    description:
      "A study in scale, solitude, and the shapes the sun leaves behind.",
    image: "/images/desert.webp",
    alt: "Sweeping sand dunes with sunlit ridges and deep shadows",
    tags: ["desert", "warm", "landscape", "minimal"],
    lighting:
      "Low, directional sunlight. Let long shadows reveal the shape of the dunes.",
    composition:
      "Give the horizon room to breathe. Use a sweeping ridge as a leading line.",
    palette: "Warm ochre, pale sand, and deep earthy shadows.",
    source: "https://images.unsplash.com/photo-1542401886-65d6c61db217",
  },
  {
    id: "street-editorial",
    title: "Off-duty editorial",
    category: "Editorial",
    description: "Streetwear, strong color, and a confident point of view.",
    image: "/images/fashion.webp",
    alt: "Full-length fashion portrait of a woman in a yellow tracksuit on an outdoor basketball court",
    tags: ["fashion", "street", "yellow", "portrait"],
    lighting: "Bright daylight gives the outfit a crisp, energetic presence.",
    composition:
      "Frame the whole silhouette. Give the open court space to add context.",
    palette: "Saturated yellow, clear sky blue, and sunlit concrete.",
    source: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f",
  },
  {
    id: "quiet-luxury",
    title: "Quiet luxury",
    category: "Product",
    description:
      "A familiar object, made remarkable by light and a little restraint.",
    image: "/images/perfume.webp",
    alt: "A glass perfume bottle photographed as a minimal product still life",
    tags: ["perfume", "glass", "still life", "minimal", "beauty"],
    lighting:
      "Broad, soft light with a gentle edge highlight to describe the glass.",
    composition:
      "Keep the frame simple. Leave intentional negative space around the bottle.",
    palette: "Soft blush, transparent glass, and restrained dark accents.",
    source: "https://images.unsplash.com/photo-1541643600914-78b084683601",
  },
  {
    id: "sculpted-space",
    title: "Sculpted space",
    category: "Architecture",
    description:
      "Architecture as an abstract canvas of rhythm, light, and form.",
    image: "/images/architecture.webp",
    alt: "An upward view through geometric glass-and-steel city architecture under a cloudy sky",
    tags: ["architecture", "geometry", "minimal", "structure"],
    lighting:
      "Soft overcast light lets the glass, metal, and cloud carry the atmosphere.",
    composition:
      "Look upward. Use symmetry and converging lines to build depth.",
    palette: "Cool gray glass, dark metal, and a soft cloudy sky.",
    source: "https://images.unsplash.com/photo-1511818966892-d7d671e672a2",
  },
  {
    id: "automotive-attitude",
    title: "Automotive attitude",
    category: "Cinematic",
    description: "Chiseled bodywork emerges from a quiet, dark backdrop.",
    image: "/images/automotive.webp",
    alt: "Low front view of a white sports coupe in a dark showroom",
    tags: ["car", "automotive", "urban", "dramatic"],
    lighting:
      "Let controlled reflections trace the bodywork against a low-key background.",
    composition:
      "Get close and low. Let perspective emphasize the car's stance.",
    palette: "White bodywork, metallic highlights, and deep charcoal shadows.",
    source: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7",
  },
  {
    id: "color-in-motion",
    title: "Color in motion",
    category: "Abstract",
    description:
      "Follow the flow. A playful collision of pigment and possibility.",
    image: "/images/pigment.webp",
    alt: "Swirling multicolored pigment forming vivid organic abstract patterns",
    tags: ["abstract", "color", "texture", "fluid", "vibrant"],
    lighting:
      "Even light lets the pigment's fine texture and color do the work.",
    composition:
      "Fill the frame. Follow a single current through the surrounding chaos.",
    palette: "Expressive color contrasts with rich, flowing transitions.",
    source: "https://images.unsplash.com/photo-1541701494587-cb58502866ab",
  },
  {
    id: "natural-presence",
    title: "Natural presence",
    category: "Editorial",
    description: "An unhurried portrait with space for a little personality.",
    image: "/images/portrait.webp",
    alt: "An intimate portrait of a woman in black against a dark background",
    tags: ["portrait", "studio", "soft", "fashion"],
    lighting:
      "Soft side light gives the face definition while keeping the mood gentle.",
    composition:
      "Use a close, personal frame and a softly separated background.",
    palette: "Warm skin tones, soft brown hair, and a deep charcoal backdrop.",
    source: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1",
  },
  {
    id: "forest-light",
    title: "Into the quiet",
    category: "Cinematic",
    description: "A forest scene that feels like the beginning of a story.",
    image: "/images/forest.webp",
    alt: "Tall forest trees receding into a softly lit green woodland",
    tags: ["forest", "green", "nature", "atmospheric", "landscape"],
    lighting: "Let filtered daylight build depth between the trees.",
    composition:
      "Repeat the vertical tree shapes. Leave a clear visual path into the frame.",
    palette: "Layered greens, dark bark, and soft daylight.",
    source: "https://images.unsplash.com/photo-1448375240586-882707db888b",
  },
];
