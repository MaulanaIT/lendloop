// Pure data, shared by Convex functions and the UI. Icons live in
// components/lendloop/category-icon.tsx so Convex never bundles React.

export const CATEGORIES = [
  "power",
  "hand",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "ladders",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<Category, { label: string; slug: string }> = {
  power: { label: "Power tools", slug: "power-tools" },
  hand: { label: "Hand tools", slug: "hand-tools" },
  garden: { label: "Garden", slug: "garden" },
  kitchen: { label: "Kitchen", slug: "kitchen" },
  camping: { label: "Camping", slug: "camping" },
  cleaning: { label: "Cleaning", slug: "cleaning" },
  ladders: { label: "Ladders & moving", slug: "ladders-moving" },
  other: { label: "Other", slug: "other" },
};

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/** URL slug ("power-tools") → category key ("power"). Unknown slugs return null. */
export function categoryFromSlug(slug: string | null | undefined): Category | null {
  if (!slug) return null;
  return CATEGORIES.find((c) => CATEGORY_META[c].slug === slug) ?? null;
}

export const CONDITIONS = ["likenew", "good", "fair", "worn"] as const;

export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_META: Record<Condition, { label: string; helper: string }> = {
  likenew: { label: "Like new", helper: "barely used" },
  good: { label: "Good", helper: "works perfectly, light wear" },
  fair: { label: "Fair", helper: "works, visible wear" },
  worn: { label: "Worn", helper: "works but needs care" },
};

export function isCondition(value: unknown): value is Condition {
  return typeof value === "string" && (CONDITIONS as readonly string[]).includes(value);
}

/** Listing field limits, enforced in Convex and mirrored by the form. */
export const TOOL_LIMITS = {
  name: { min: 3, max: 60 },
  description: { min: 10, max: 280 },
} as const;

export const REMOVE_REASONS = ["Prohibited item", "Unsafe", "Spam", "Duplicate", "Other"] as const;
export type RemoveReason = (typeof REMOVE_REASONS)[number];

export const DECLINE_REASONS = [
  "Needed it that weekend",
  "Not available right now",
  "Already lent out",
] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

/** System reason used when approving one request auto-declines overlapping ones. */
export const SYSTEM_DECLINE_REASON = "Dates taken";
