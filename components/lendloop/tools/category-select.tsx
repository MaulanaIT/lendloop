"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import type { Ref } from "react";
import { CATEGORY_BG, CATEGORY_FG, CategoryIcon } from "@/components/lendloop/category-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORIES, CATEGORY_META, isCategory, type Category } from "@/lib/domain/categories";
import { cn } from "@/lib/utils";

function SmallTile({ category }: { category: Category }) {
  return (
    <span
      aria-hidden
      className={cn("grid size-[26px] shrink-0 place-items-center rounded-sm", CATEGORY_BG[category], CATEGORY_FG[category])}
    >
      <CategoryIcon category={category} colored={false} className="size-4" />
    </span>
  );
}

export type CategorySelectProps = {
  id: string;
  labelId: string;
  value: Category | null;
  onChange: (value: Category) => void;
  /** Called when the menu closes, to mark the field as touched. */
  onClose: () => void;
  invalid: boolean;
  describedBy?: string;
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/** Category picker with each category's icon tile (brief B5). */
export function CategorySelect({
  id,
  labelId,
  value,
  onChange,
  onClose,
  invalid,
  describedBy,
  disabled,
  ref,
}: CategorySelectProps) {
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger
        ref={ref}
        id={id}
        disabled={disabled}
        aria-labelledby={`${labelId} ${id}`}
        aria-required
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          "flex h-11 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md border bg-card px-3 text-left text-[15px] md:h-10",
          "transition-colors duration-150 disabled:cursor-not-allowed",
          invalid ? "border-destructive" : "border-control-border data-[state=open]:border-primary",
        )}
      >
        {value ? (
          <>
            <SmallTile category={value} />
            <span className="flex-1 truncate font-medium">{CATEGORY_META[value].label}</span>
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">Choose a category</span>
        )}
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[340px] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
      >
        <DropdownMenuRadioGroup value={value ?? ""} onValueChange={(v) => isCategory(v) && onChange(v)}>
          {CATEGORIES.map((c) => (
            <DropdownMenuRadioItem
              key={c}
              value={c}
              className={cn("py-1", value === c && "bg-primary-subtle data-[highlighted]:bg-primary-subtle")}
            >
              <SmallTile category={c} />
              <span className="flex-1">{CATEGORY_META[c].label}</span>
              {value === c ? <Check aria-hidden className="text-primary" /> : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
