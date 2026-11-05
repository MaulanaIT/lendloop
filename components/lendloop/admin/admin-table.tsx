"use client";

import type { MouseEvent, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type AdminColumn<T> = {
  key: string;
  header: ReactNode;
  /** Visually hidden header text (e.g. "Actions"). */
  srOnlyHeader?: boolean;
  align?: "left" | "right";
  /** Header cell classes, usually a fixed width ("w-24"). */
  className?: string;
  cell: (row: T) => ReactNode;
  cellClassName?: string | ((row: T) => string | undefined);
};

/**
 * Viewport width at which the table replaces the stacked cards. Literal class
 * pairs so Tailwind can see them; both layouts are CSS-switched, so there is
 * no hydration flash and no JS media query.
 */
const BREAKPOINT = {
  900: { table: "hidden min-[900px]:table", cards: "min-[900px]:hidden" },
  1000: { table: "hidden min-[1000px]:table", cards: "min-[1000px]:hidden" },
  1100: { table: "hidden min-[1100px]:table", cards: "min-[1100px]:hidden" },
  1180: { table: "hidden min-[1180px]:table", cards: "min-[1180px]:hidden" },
} as const;

export type AdminBreakpoint = keyof typeof BREAKPOINT;

const ROW_HEIGHT = {
  44: "h-11",
  48: "h-12",
  52: "h-[52px]",
  56: "h-14",
} as const;

export type AdminTableProps<T> = {
  /** Accessible name of the table and the card list ("Loans"). */
  label: string;
  rows: T[];
  columns: AdminColumn<T>[];
  rowKey: (row: T) => string;
  /** Mobile/tablet: one stacked card per row (rendered inside an <li>). */
  renderCard: (row: T) => ReactNode;
  breakpoint?: AdminBreakpoint;
  /** Minimum row height on desktop: 44 (listings), 48 (loans), 52 (deliveries), 56 (users). */
  rowHeight?: keyof typeof ROW_HEIGHT;
  /** "md" 12px cell padding · "sm" 10px with 14px outer edges (dense automation table). */
  density?: "md" | "sm";
  textSize?: "sm" | "xs";
  rowClassName?: (row: T) => string | undefined;
  /** Whole-row click (mouse convenience). Keep a real link in the row for keyboard users. */
  onRowClick?: (row: T) => void;
  className?: string;
};

/**
 * Admin data table: sticky header under the 64px app header, compact rows,
 * rounded card frame; below `breakpoint` it becomes a list of stacked cards.
 */
export function AdminTable<T>({
  label,
  rows,
  columns,
  rowKey,
  renderCard,
  breakpoint = 900,
  rowHeight = 44,
  density = "md",
  textSize = "sm",
  rowClassName,
  onRowClick,
  className,
}: AdminTableProps<T>) {
  const bp = BREAKPOINT[breakpoint];
  const pad = density === "sm" ? "px-2.5 first:pl-3.5 last:pr-3.5" : "px-3";

  const handleRowClick = (row: T) => (e: MouseEvent<HTMLTableRowElement>) => {
    // Links and buttons inside the row handle their own clicks.
    if ((e.target as HTMLElement).closest("a,button,input,label,[role=switch]")) return;
    onRowClick?.(row);
  };

  return (
    <div className={className}>
      <table
        aria-label={label}
        className={cn(
          bp.table,
          "w-full border-separate border-spacing-0 rounded-lg border border-border bg-card shadow-ll-card",
          textSize === "xs" ? "text-[13px]" : "text-sm",
          // Round the outer corners of the first header row and the last body row.
          "[&_thead_th:first-child]:rounded-tl-[11px] [&_thead_th:last-child]:rounded-tr-[11px]",
          "[&_tbody_tr:last-child>td:first-child]:rounded-bl-[11px] [&_tbody_tr:last-child>td:last-child]:rounded-br-[11px]",
        )}
      >
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "sticky top-16 z-[5] h-10 border-b border-border bg-card text-xs font-semibold text-muted-foreground",
                  pad,
                  c.align === "right" ? "text-right" : "text-left",
                  c.className,
                )}
              >
                {c.srOnlyHeader ? <span className="sr-only">{c.header}</span> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr+tr>td]:border-t [&>tr+tr>td]:border-border">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? handleRowClick(row) : undefined}
              className={cn(
                "bg-card",
                onRowClick && "cursor-pointer transition-colors hover:bg-muted",
                rowClassName?.(row),
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    ROW_HEIGHT[rowHeight],
                    "py-1.5 align-middle",
                    pad,
                    c.align === "right" && "text-right tabular",
                    typeof c.cellClassName === "function" ? c.cellClassName(row) : c.cellClassName,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul aria-label={label} className={cn(bp.cards, "m-0 flex list-none flex-col gap-2.5 p-0")}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="min-w-0">
            {renderCard(row)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Label/value grid used inside stacked cards (96px label column). */
export function StackedFields({
  items,
  className,
}: {
  items: { label: string; value: ReactNode; className?: string }[];
  className?: string;
}) {
  return (
    <dl
      className={cn("m-0 grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px] tabular", className)}
    >
      {items.map((it) => (
        <div key={it.label} className="contents">
          <dt className="text-muted-foreground">{it.label}</dt>
          <dd className={cn("m-0 min-w-0", it.className)}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Card frame for one stacked row. */
export const stackedCardClasses =
  "flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3.5 text-foreground shadow-ll-card";

/**
 * Loading rows in the table's shape: a 40px header strip, then rows of pulse
 * bars sized by `cells` (Tailwind classes per bar).
 */
export function AdminTableSkeleton({
  label,
  cells,
  rows = 6,
  rowHeight = 44,
  className,
}: {
  label: string;
  cells: string[];
  rows?: number;
  rowHeight?: keyof typeof ROW_HEIGHT;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}
    >
      <div className="h-10 bg-muted" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn("flex items-center gap-4 border-t border-border px-3", ROW_HEIGHT[rowHeight])}>
          {cells.map((c, j) => (
            <Skeleton key={j} className={c} />
          ))}
        </div>
      ))}
    </div>
  );
}
