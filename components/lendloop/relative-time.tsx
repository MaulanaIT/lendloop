"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { fmtAbsolute } from "@/lib/copy";
import { APP_TIME_ZONE } from "@/lib/config";
import {
  fmtDay,
  fmtDayWithWeekday,
  fmtRangeShort,
  fmtRelative,
  isoDateTime,
  todayISO,
  type ISODate,
} from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import { useNow } from "./use-now";

export type RelativeTimeProps = {
  /** Epoch ms (Convex _creationTime / at fields). */
  ms: number;
  /** Override "now" (tests, or to share one clock across a list). Defaults to a ticking clock. */
  nowMs?: number;
  /** Show the dotted underline + tooltip with the absolute time (default true). */
  withTooltip?: boolean;
  className?: string;
};

/**
 * <time dateTime> showing "just now", "2h ago", "today 09:02", "yesterday 09:00"
 * or "Oct 29, 14:02" in the neighborhood timezone. The absolute time
 * ("Thu, Nov 5, 2026 · 09:02") is in a tooltip and the title attribute.
 */
export function RelativeTime({ ms, nowMs, withTooltip = true, className }: RelativeTimeProps) {
  const ticking = useNow();
  const now = nowMs ?? ticking;
  const label = fmtRelative(ms, now, APP_TIME_ZONE);
  const abs = fmtAbsolute(ms);
  const time = (
    <time
      dateTime={isoDateTime(ms)}
      title={withTooltip ? undefined : abs}
      tabIndex={withTooltip ? 0 : undefined}
      className={cn(
        "tabular",
        withTooltip && "rounded-[4px] underline decoration-dotted underline-offset-[3px]",
        className,
      )}
    >
      {label}
    </time>
  );
  return withTooltip ? <Tooltip content={abs}>{time}</Tooltip> : time;
}

/** A calendar day as <time>: "Nov 4", or "Sat, Nov 14" with `weekday`. */
export function DayDate({ date, weekday = false, className }: { date: ISODate; weekday?: boolean; className?: string }) {
  return (
    <time dateTime={date} className={cn("tabular", className)}>
      {weekday ? fmtDayWithWeekday(date) : fmtDay(date)}
    </time>
  );
}

/** The calendar day of an epoch-ms instant ("Nov 2") in the app timezone, as <time>. */
export function MsDay({ ms, className }: { ms: number; className?: string }) {
  return (
    <time dateTime={isoDateTime(ms)} className={cn("tabular", className)}>
      {fmtDay(todayISO(ms, APP_TIME_ZONE))}
    </time>
  );
}

/** Compact "Nov 8–9" / "Oct 31 – Nov 3" as one <time> on the start day. */
export function ShortRange({ start, end, className }: { start: ISODate; end: ISODate; className?: string }) {
  return (
    <time dateTime={start} className={cn("tabular", className)}>
      {fmtRangeShort(start, end)}
    </time>
  );
}

/** "Oct 31 → Nov 3" with both ends as <time>. Strike it for cancelled loans. */
export function DateRange({
  start,
  end,
  weekday = false,
  className,
}: {
  start: ISODate;
  end: ISODate;
  weekday?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("tabular", className)}>
      <DayDate date={start} weekday={weekday} /> → <DayDate date={end} weekday={weekday} />
    </span>
  );
}
