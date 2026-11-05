"use client";

import { SlidersHorizontal } from "lucide-react";
import { useId } from "react";
import { CategoryChips, type CategoryFilter } from "@/components/lendloop/category-chip";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { Category } from "@/lib/domain/categories";
import { cn } from "@/lib/utils";

export type FilterBarProps = {
  q: string;
  onQChange: (q: string) => void;
  category: CategoryFilter;
  onCategoryChange: (c: CategoryFilter) => void;
  availableOnly: boolean;
  onAvailableOnlyChange: (v: boolean) => void;
  /** Per-category counts after search + availability filters. */
  counts: Partial<Record<Category, number>>;
  /** "All" chip count (search + availability applied). */
  total: number;
  /** Visible cards after every filter. */
  shown: number;
  /** All live tools. */
  overall: number;
  onClear: () => void;
  /** Hide the result count while the list is loading or failed. */
  showCount: boolean;
};

const AVAILABLE_HELP = "Not on loan or overdue today. Tools with only future bookings count.";

/**
 * Browse filter bar (brief B3). Desktop: search · "Showing X of Y" · Available
 * only, then the chip row. Mobile: search + a "Filters" button that opens a
 * bottom sheet with the switch and the count; chips scroll sideways.
 */
export function FilterBar(props: FilterBarProps) {
  const { q, onQChange, category, onCategoryChange, availableOnly, onAvailableOnlyChange, counts, total } = props;
  const resultText = `Showing ${props.shown} of ${props.overall}`;

  return (
    <div role="search" aria-label="Filter tools" className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-[1_1_280px] gap-2 md:max-w-[420px]">
          <SearchInput
            aria-label="Search tools"
            placeholder="Search tools…"
            value={q}
            onChange={(e) => onQChange(e.target.value)}
          />
          <MobileFilters {...props} resultText={resultText} />
        </div>
        <div className="hidden items-center gap-5 md:flex">
          {props.showCount ? (
            <span role="status" className="text-muted-foreground tabular">
              {resultText}
            </span>
          ) : null}
          <Switch checked={availableOnly} onCheckedChange={onAvailableOnlyChange}>
            Available only
          </Switch>
        </div>
      </div>
      <CategoryChips value={category} onChange={onCategoryChange} counts={counts} total={total} selectedIndicator="check" />
    </div>
  );
}

function MobileFilters({
  availableOnly,
  onAvailableOnlyChange,
  onClear,
  shown,
  resultText,
}: FilterBarProps & { resultText: string }) {
  const helpId = useId();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-11 border-control-border px-3.5 md:hidden [&_svg]:size-5",
            availableOnly && "border-primary bg-primary-subtle hover:bg-primary-subtle",
          )}
        >
          <SlidersHorizontal aria-hidden />
          Filters
          {availableOnly ? (
            <span
              aria-label="1 filter on"
              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-[5px] text-[11px] text-primary-foreground"
            >
              1
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="bg-card">
        <SheetHeader sticky={false} closeLabel="Close filters" className="items-center">
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1.5">
          <Switch
            checked={availableOnly}
            onCheckedChange={onAvailableOnlyChange}
            labelFirst
            aria-describedby={helpId}
            className="min-h-11 w-full text-base md:min-h-11"
          >
            Available only
          </Switch>
          <SheetDescription id={helpId} className="text-[13px]">
            {AVAILABLE_HELP}
          </SheetDescription>
        </div>
        <p role="status" className="m-0 border-t border-border pt-3 text-muted-foreground tabular">
          {resultText}
        </p>
        <SheetFooter>
          <Button variant="outline" className="h-11" onClick={onClear}>
            Clear
          </Button>
          <SheetClose asChild>
            <Button className="h-11">{shown === 1 ? "Show 1 tool" : `Show ${shown} tools`}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
