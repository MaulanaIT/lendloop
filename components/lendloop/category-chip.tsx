"use client";

import { Check } from "lucide-react";
import { CATEGORIES, CATEGORY_META, type Category } from "@/lib/domain/categories";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

/** Static outline chip: colored category icon + label in foreground (cards, rows). */
export function CategoryChip({ category, className }: { category: Category; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-[3px] text-xs leading-[1.3] font-medium text-foreground",
        className,
      )}
    >
      <CategoryIcon category={category} className="size-3.5" />
      {CATEGORY_META[category].label}
    </span>
  );
}

export type CategoryFilter = Category | "all";

export type CategoryChipsProps = {
  value: CategoryFilter;
  onChange: (value: CategoryFilter) => void;
  /** Count per category for the current search/availability filters. "All" shows the sum unless `total` is given. */
  counts: Partial<Record<Category, number>>;
  /** Count shown on "All" (defaults to the sum of `counts`). */
  total?: number;
  /** Landing page: hide categories with 0 tools. Browse keeps every chip. */
  hideEmpty?: boolean;
  /**
   * "check" (Browse): the selected chip swaps its icon for a teal Check.
   * "icon" (Landing): chips keep their category icon when selected.
   */
  selectedIndicator?: "check" | "icon";
  /** Group label for screen readers. */
  label?: string;
  className?: string;
};

/**
 * Horizontal filter row: All + one chip per category with counts. Toggle
 * buttons (aria-pressed); single select. Scrolls sideways on mobile with a
 * right-edge fade; the page itself never scrolls horizontally.
 */
export function CategoryChips({
  value,
  onChange,
  counts,
  total,
  hideEmpty = false,
  selectedIndicator = "check",
  label = "Filter by category",
  className,
}: CategoryChipsProps) {
  const all = total ?? CATEGORIES.reduce((n, c) => n + (counts[c] ?? 0), 0);
  const cats = CATEGORIES.filter((c) => !hideEmpty || (counts[c] ?? 0) > 0 || c === value);

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        // 4px inner padding (offset by negative margins) keeps the 2px + 2px
        // focus ring inside the scroll box, which would otherwise clip it.
        "-mx-1 -mt-0.5 flex flex-nowrap gap-2 overflow-x-auto px-1 pt-1 pb-1.5",
        "[mask-image:linear-gradient(to_right,#000_calc(100%-40px),transparent)] md:[mask-image:none]",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <Chip selected={value === "all"} onClick={() => onChange("all")} label="All" count={all} indicator={selectedIndicator} />
      {cats.map((c) => (
        <Chip
          key={c}
          category={c}
          selected={value === c}
          onClick={() => onChange(c)}
          label={CATEGORY_META[c].label}
          count={counts[c] ?? 0}
          indicator={selectedIndicator}
        />
      ))}
    </div>
  );
}

function Chip({
  category,
  selected,
  onClick,
  label,
  count,
  indicator,
}: {
  category?: Category;
  selected: boolean;
  onClick: () => void;
  label: string;
  count: number;
  indicator: "check" | "icon";
}) {
  const showCheck = selected && indicator === "check";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap text-foreground md:h-9",
        "transition-colors duration-150 hover:border-primary",
        selected ? "border-primary bg-primary-subtle" : "border-control-border bg-card",
      )}
    >
      {showCheck ? <Check aria-hidden className="size-4 text-primary" /> : null}
      {category && !showCheck ? <CategoryIcon category={category} className="size-4" /> : null}
      <span>{label}</span>
      <span className="text-muted-foreground tabular">{count}</span>
    </button>
  );
}
