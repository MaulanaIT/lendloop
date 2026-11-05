import {
  CookingPot,
  Drill,
  Hammer,
  Shapes,
  SprayCan,
  Sprout,
  Tent,
  Truck,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { CATEGORY_META, type Category } from "@/lib/domain/categories";
import { cn } from "@/lib/utils";

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  power: Drill,
  hand: Hammer,
  garden: Sprout,
  kitchen: CookingPot,
  camping: Tent,
  cleaning: SprayCan,
  ladders: Truck,
  other: Shapes,
};

/** Category text color (icon only; chip text stays foreground per brief A7). */
export const CATEGORY_FG: Record<Category, string> = {
  power: "text-[var(--cat-power-fg)]",
  hand: "text-[var(--cat-hand-fg)]",
  garden: "text-[var(--cat-garden-fg)]",
  kitchen: "text-[var(--cat-kitchen-fg)]",
  camping: "text-[var(--cat-camping-fg)]",
  cleaning: "text-[var(--cat-cleaning-fg)]",
  ladders: "text-[var(--cat-ladders-fg)]",
  other: "text-[var(--cat-other-fg)]",
};

export const CATEGORY_BG: Record<Category, string> = {
  power: "bg-[var(--cat-power-bg)]",
  hand: "bg-[var(--cat-hand-bg)]",
  garden: "bg-[var(--cat-garden-bg)]",
  kitchen: "bg-[var(--cat-kitchen-bg)]",
  camping: "bg-[var(--cat-camping-bg)]",
  cleaning: "bg-[var(--cat-cleaning-bg)]",
  ladders: "bg-[var(--cat-ladders-bg)]",
  other: "bg-[var(--cat-other-bg)]",
};

/** Decorative category icon in its category color (aria-hidden; pair it with text). */
export function CategoryIcon({
  category,
  className,
  colored = true,
  ...props
}: Omit<LucideProps, "ref"> & { category: Category; colored?: boolean }) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon aria-hidden className={cn("shrink-0", colored && CATEGORY_FG[category], className)} {...props} />;
}

const TILE = {
  32: { box: "size-8 rounded-md", icon: "size-4" },
  40: { box: "size-10 rounded-tile", icon: "size-5" },
  48: { box: "size-12 rounded-tile", icon: "size-6" },
  56: { box: "size-14 rounded-lg", icon: "size-7" },
  64: { box: "size-16 rounded-lg", icon: "size-8" },
} as const;

export type CategoryTileProps = {
  category: Category;
  /** 40 (rows) · 48 (cards, default) · 56 (loan header) · 64 (tool detail). */
  size?: keyof typeof TILE;
  /**
   * Announce the category ("Garden") as an image. Leave false when the
   * category is already written next to the tile.
   */
  labelled?: boolean;
  className?: string;
};

/** Colored square tile with the category icon (no photos, brief A7). */
export function CategoryTile({ category, size = 48, labelled = false, className }: CategoryTileProps) {
  const s = TILE[size];
  return (
    <span
      {...(labelled ? { role: "img", "aria-label": CATEGORY_META[category].label } : { "aria-hidden": true })}
      className={cn("grid shrink-0 place-items-center", s.box, CATEGORY_BG[category], CATEGORY_FG[category], className)}
    >
      <CategoryIcon category={category} className={s.icon} colored={false} />
    </span>
  );
}
