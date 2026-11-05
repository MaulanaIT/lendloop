"use client";

import { SlidersHorizontal } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CATEGORIES, CATEGORY_META, type Category } from "@/lib/domain/categories";
import { cn } from "@/lib/utils";

/** "Showing 8 of 13", announced politely as filters change. */
export function ResultCount({ shown, total, className }: { shown: number; total: number; className?: string }) {
  return (
    <p role="status" className={cn("m-0 ml-auto text-muted-foreground tabular", className)}>
      {`Showing ${shown} of ${total}`}
    </p>
  );
}

/** Mobile-only "Filters" button that opens the bottom sheet; shows the active filter count. */
export function FiltersButton({
  count = 0,
  onClick,
  className,
}: {
  count?: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      aria-haspopup="dialog"
      onClick={onClick}
      className={cn("md:hidden", count > 0 && "border-primary bg-primary-subtle", className)}
    >
      <SlidersHorizontal aria-hidden className="size-4" />
      Filters
      {count > 0 ? (
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-[5px] text-[11px] text-primary-foreground tabular">
          <span className="sr-only">(</span>
          {count}
          <span className="sr-only"> active)</span>
        </span>
      ) : null}
    </Button>
  );
}

export type CategoryFilterValue = Category | "all";

/** "All categories" + the eight categories as a filter select. */
export function CategorySelect({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof NativeSelect>, "value" | "onChange"> & {
  value: CategoryFilterValue;
  onChange: (v: CategoryFilterValue) => void;
}) {
  return (
    <NativeSelect
      value={value}
      active={value !== "all"}
      onChange={(e) => onChange(e.target.value as CategoryFilterValue)}
      {...props}
    >
      <option value="all">All categories</option>
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {CATEGORY_META[c].label}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Label wrapping a full-width select inside the mobile filter sheet. */
export function SheetField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 font-medium">
      {label}
      {children}
    </label>
  );
}

/** Mobile bottom sheet: "Filters" title, fields, result count, [Clear] [Show …]. */
export function FiltersSheet({
  open,
  onOpenChange,
  shown,
  total,
  showLabel = "Show results",
  onClear,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shown: number;
  total: number;
  showLabel?: string;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader sticky={false} closeLabel="Close filters" className="items-center">
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        {children}
        <ResultCount shown={shown} total={total} className="ml-0 border-t border-border pt-3" />
        <SheetFooter>
          <Button variant="outline" onClick={onClear}>
            Clear
          </Button>
          <Button onClick={() => onOpenChange(false)}>{showLabel}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** "No loans match these filters." + [Clear filters]. */
export function NoMatches({ title, onClear }: { title: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-10 text-center">
      <h2 className="m-0 font-display text-xl font-semibold">{title}</h2>
      <Button variant="outline" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
