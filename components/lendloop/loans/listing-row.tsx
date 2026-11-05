"use client";

import { Eye, Pencil, Trash } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AvailabilityPill } from "@/components/lendloop/availability-pill";
import { CATEGORY_BG, CategoryIcon } from "@/components/lendloop/category-icon";
import { DayDate, MsDay } from "@/components/lendloop/relative-time";
import { ReturnReportedChip } from "@/components/lendloop/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { OFFLINE_ACTION_REASON } from "@/lib/copy";
import { CATEGORY_META } from "@/lib/domain/categories";
import type { ISODate } from "@/lib/domain/dates";
import type { MyListingDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";

/** Desktop table columns (≥900px); below that every row is its own card. */
export const LISTING_COLS = "min-[900px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]";

/** "Tool · Availability · Activity · Actions" header above the desktop table. Decorative: rows carry their own labels. */
export function ListingTableHeader() {
  return (
    <div
      aria-hidden
      className={cn("hidden gap-4 px-5 pb-2 text-xs font-medium text-muted-foreground min-[900px]:grid", LISTING_COLS)}
    >
      <span>Tool</span>
      <span>Availability</span>
      <span>Activity</span>
      <span className="text-right">Actions</span>
    </div>
  );
}

/** The activity line: removal note, current borrower, last lent, or "Not lent yet". */
function activityLine(
  l: MyListingDTO,
  today: ISODate,
): { text: ReactNode; tone: "muted" | "foreground" | "danger" } | null {
  if (l.removed) {
    const reason = l.removed.detail ? `${l.removed.reason} · ${l.removed.detail}` : l.removed.reason;
    // The admin's identity is deliberately not part of the DTO: moderation stays impersonal.
    return {
      text: (
        <>
          Removed by an admin on <MsDay ms={l.removed.at} /> · Reason: {reason}
        </>
      ),
      tone: "muted",
    };
  }
  if (l.currentLoan) {
    const { borrowerName, endDate } = l.currentLoan;
    return endDate < today
      ? {
          text: (
            <>
              With {borrowerName} · was due <DayDate date={endDate} />
            </>
          ),
          tone: "danger",
        }
      : {
          text: (
            <>
              With {borrowerName} until <DayDate date={endDate} />
            </>
          ),
          tone: "foreground",
        };
  }
  if (l.lastLentOn) {
    return {
      text: (
        <>
          Last lent <DayDate date={l.lastLentOn} />
        </>
      ),
      tone: "muted",
    };
  }
  if (!l.pendingCount) return { text: "Not lent yet", tone: "muted" };
  return null;
}

export type ListingRowProps = {
  listing: MyListingDTO;
  today: ISODate;
  offline: boolean;
  onDelete: () => void;
};

/** One row of "My listings" (brief B6): table row on desktop, card on mobile. */
export function ListingRow({ listing: l, today, offline, onDelete }: ListingRowProps) {
  const removed = l.removed !== null;
  const line = activityLine(l, today);
  const iconBtn = "md:size-9 [&_svg]:size-4";
  // Mirrors the Convex rule in tools.remove (refused while lent out or booked).
  const deleteBlocked = offline ? OFFLINE_ACTION_REASON : l.canDelete ? null : l.deleteBlockedReason;

  return (
    <li
      aria-label={removed ? `${l.name}, removed` : l.name}
      className={cn(
        "grid min-w-0 grid-cols-1 items-center gap-x-4 gap-y-3 rounded-lg border border-border p-4 shadow-ll-card",
        "min-[900px]:rounded-none min-[900px]:border-0 min-[900px]:border-t min-[900px]:px-5 min-[900px]:py-4 min-[900px]:shadow-none",
        "min-[900px]:first:rounded-t-[11px] min-[900px]:first:border-t-0 min-[900px]:last:rounded-b-[11px]",
        LISTING_COLS,
        removed ? "bg-muted" : "bg-card",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-tile",
            removed ? "bg-muted text-muted-foreground" : CATEGORY_BG[l.category],
          )}
        >
          <CategoryIcon category={l.category} colored={!removed} className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          {removed ? (
            <span className="text-[15px] font-semibold [overflow-wrap:anywhere] text-muted-foreground">{l.name}</span>
          ) : (
            <Link
              href={`/tools/${l._id}`}
              className="text-[15px] font-semibold [overflow-wrap:anywhere] text-foreground no-underline hover:text-primary"
            >
              {l.name}
            </Link>
          )}
          <span className="text-[13px] text-muted-foreground">{CATEGORY_META[l.category].label}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <AvailabilityPill availability={l.availability} today={today} />
        {l.currentLoan?.returnReported ? <ReturnReportedChip size="sm" className="min-h-6" /> : null}
      </div>

      <div className="flex min-w-0 flex-col gap-1 text-sm">
        {line ? (
          <span
            className={cn(
              "tabular text-pretty",
              line.tone === "muted" && "text-muted-foreground",
              line.tone === "foreground" && "text-foreground",
              line.tone === "danger" && "text-danger",
            )}
          >
            {line.text}
          </span>
        ) : null}
        {!removed && (l.pendingCount > 0 || l.currentLoan) ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {l.pendingCount > 0 ? (
              <Link
                href="/me/incoming"
                className="inline-flex min-h-11 items-center gap-1 font-semibold no-underline tabular md:min-h-6"
              >
                {l.pendingCount} pending →
              </Link>
            ) : null}
            {l.currentLoan ? (
              <Link
                href={`/me/incoming?tab=${l.availability.kind === "overdue" ? "overdue" : "active"}`}
                className="inline-flex min-h-11 items-center gap-1 font-semibold no-underline md:min-h-6"
              >
                Mark returned →
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex justify-start gap-1.5 min-[900px]:justify-end">
        {/* Owners get View/Edit/Delete; removed listings are read-only. Convex enforces ownership on edit/delete. */}
        {!removed ? (
          <>
            <Tooltip content="View">
              <Button asChild variant="outline" size="icon-sm" className={iconBtn}>
                <Link href={`/tools/${l._id}`} aria-label={`View ${l.name}`}>
                  <Eye aria-hidden />
                </Link>
              </Button>
            </Tooltip>
            <Tooltip content="Edit">
              <Button asChild variant="outline" size="icon-sm" className={iconBtn}>
                <Link href={`/tools/${l._id}/edit`} aria-label={`Edit ${l.name}`}>
                  <Pencil aria-hidden />
                </Link>
              </Button>
            </Tooltip>
            {deleteBlocked ? (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={`Delete ${l.name}`}
                disabledReason={deleteBlocked}
                className={cn(iconBtn, "text-destructive hover:text-destructive")}
              >
                <Trash aria-hidden />
              </Button>
            ) : (
              <Tooltip content="Delete">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Delete ${l.name}`}
                  onClick={onDelete}
                  className={cn(iconBtn, "text-destructive hover:text-destructive")}
                >
                  <Trash aria-hidden />
                </Button>
              </Tooltip>
            )}
          </>
        ) : null}
      </div>
    </li>
  );
}

/** Loading placeholder in the same shape as the listing table (4 rows). */
export function ListingRowsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading your listings"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      {[0, 1, 2, 3].map((k) => (
        <div key={k} className="flex items-center gap-3.5 border-t border-border px-5 py-[18px] first:border-t-0">
          <Skeleton className="size-10 shrink-0 rounded-tile" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-6 w-[110px] rounded-full sm:block" />
          <Skeleton className="hidden h-9 w-[120px] rounded-md sm:block" />
        </div>
      ))}
    </div>
  );
}
