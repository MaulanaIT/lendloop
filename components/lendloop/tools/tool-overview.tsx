import { Gauge, LockOpen, Mail } from "lucide-react";
import Link from "next/link";
import { AvailabilityPill } from "@/components/lendloop/availability-pill";
import { CategoryChip } from "@/components/lendloop/category-chip";
import { CategoryTile } from "@/components/lendloop/category-icon";
import { AvailabilityCalendar, CalendarLegend } from "@/components/lendloop/date-range-picker";
import { PersonAvatar } from "@/components/lendloop/person";
import { TrustedLenderBadge } from "@/components/lendloop/trusted-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_META, CONDITION_META } from "@/lib/domain/categories";
import { fmtMonthYear, type ISODate } from "@/lib/domain/dates";
import type { ToolDetailDTO } from "@/lib/domain/dto";
import { APP_TIME_ZONE } from "@/lib/config";

/** Breadcrumb, 64px tile + availability, H1, category chip, condition, description. */
export function ToolHeader({ tool, today }: { tool: ToolDetailDTO; today: ISODate }) {
  const condition = CONDITION_META[tool.condition];
  const cat = CATEGORY_META[tool.category];
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb">
        <ol className="m-0 flex list-none items-center gap-1.5 p-0 text-sm text-muted-foreground">
          <li>
            <Link
              href="/tools"
              className="inline-flex min-h-8 items-center font-medium text-muted-foreground no-underline hover:text-foreground"
            >
              Browse
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link
              href={`/tools?category=${cat.slug}`}
              className="inline-flex min-h-8 items-center font-medium text-muted-foreground no-underline hover:text-foreground"
            >
              {cat.label}
            </Link>
          </li>
        </ol>
      </nav>

      <div className="flex items-start justify-between gap-3">
        <CategoryTile category={tool.category} size={64} className="rounded-tile [&_svg]:size-6" />
        <AvailabilityPill availability={tool.availability} today={today} size="md" className="h-7 px-3" />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="m-0 font-display text-[clamp(26px,4vw,36px)] leading-[1.1] font-semibold tracking-[-0.02em]">
          {tool.name}
        </h1>
        {tool.isOwner ? (
          <Badge tone="outline" size="md" className="border-border text-muted-foreground">
            Your tool
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CategoryChip category={tool.category} className="h-7 px-3 text-[13px] [&_svg]:size-4" />
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Gauge aria-hidden className="size-4 shrink-0" />
          <span>
            <span className="sr-only">Condition: </span>
            <span className="font-medium text-foreground">{condition.label}</span> — {condition.helper}
          </span>
        </span>
      </div>

      <p className="m-0 max-w-[62ch] text-base leading-[1.6] text-pretty whitespace-pre-line">{tool.description}</p>
    </div>
  );
}

/**
 * "Lent by" card. The owner's email only arrives (as `contactEmail`) for a
 * borrower whose loan is approved / on loan / overdue; everyone else gets
 * name, lending since and loan count.
 */
export function OwnerBlock({ tool, contactEmail }: { tool: ToolDetailDTO; contactEmail: string | null }) {
  const { owner, ownerStats } = tool;
  const loans = ownerStats.loansCompleted;
  return (
    <section
      aria-labelledby="owner-h"
      className="flex items-start gap-3.5 rounded-lg border border-border bg-card p-5 shadow-ll-card"
    >
      <PersonAvatar initials={owner.initials} size="lg" className="size-11 text-sm" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id="owner-h" className="m-0 text-[13px] font-medium text-muted-foreground">
          {tool.isOwner ? "Listed by you" : "Lent by"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{owner.name}</span>
          {owner.trusted ? <TrustedLenderBadge size="md" className="h-6 px-[9px] [&_svg]:size-4" /> : null}
        </div>
        <p className="m-0 text-muted-foreground tabular">
          Lending since {fmtMonthYear(ownerStats.lendingSince, APP_TIME_ZONE)} · {loans}{" "}
          {loans === 1 ? "loan" : "loans"} completed
        </p>
        {contactEmail ? (
          <p className="m-0 mt-1 flex flex-wrap items-center gap-2">
            <Mail aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <a href={`mailto:${contactEmail}`} className="font-medium [overflow-wrap:anywhere]">
              {contactEmail}
            </a>
            <Badge tone="success" size="sm">
              <LockOpen aria-hidden className="size-3.5" />
              Contact unlocked
            </Badge>
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Two-month read-only calendar: approved ranges hatched, no borrower names. */
export function AvailabilitySection({ tool, today }: { tool: ToolDetailDTO; today: ISODate }) {
  return (
    <section aria-labelledby="av-h" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="av-h" className="m-0 font-display text-xl font-semibold">
          Availability
        </h2>
        <CalendarLegend />
      </div>
      <AvailabilityCalendar bookedRanges={tool.bookedRanges} today={today} months={2} />
    </section>
  );
}

/** Loading layout for the tool page (same shape as the loaded page). */
export function ToolDetailSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading tool"
      className="grid items-start gap-[clamp(24px,4vw,48px)] min-[960px]:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"
    >
      <div className="flex flex-col gap-5">
        <Skeleton className="h-3.5 w-[140px]" />
        <Skeleton className="size-16 rounded-tile" />
        <Skeleton className="h-[30px] w-[55%]" />
        <div className="flex gap-2">
          <Skeleton className="h-[26px] w-[110px] rounded-full" />
          <Skeleton className="h-[26px] w-[200px] rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-[90%]" />
        <Skeleton className="h-3.5 w-[65%]" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-[280px] rounded-lg" />
      </div>
      <div className="hidden flex-col gap-3 rounded-lg border border-border bg-card p-5 md:flex">
        <Skeleton className="h-5 w-[55%]" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-[52px] rounded-md" />
          <Skeleton className="h-[52px] rounded-md" />
        </div>
        <Skeleton className="h-[260px] rounded-md" />
        <Skeleton className="h-11 rounded-md" />
      </div>
    </div>
  );
}
