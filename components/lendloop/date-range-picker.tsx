"use client";

import { ChevronLeft, ChevronRight, CircleExclamationPoint, Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import {
  addDays,
  eachDay,
  fmtDay,
  fmtDayCount,
  fmtDayWithWeekday,
  fmtRangeShort,
  toUTC,
  type ISODate,
} from "@/lib/domain/dates";
import { MAX_LOAN_DAYS, RANGE_ERROR_COPY, validateRange } from "@/lib/domain/status";
import { cn } from "@/lib/utils";
import { useIsDesktop } from "./use-media-query";

export type DateRangeValue = { start: ISODate | null; end: ISODate | null };
export type BookedRange = { start: ISODate; end: ISODate };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
// Booked days: diagonal hatch from the prototype (border stripes on muted).
const HATCH = "bg-[repeating-linear-gradient(135deg,var(--border)_0_2px,var(--muted)_2px_5px)]";

// ─── Pure helpers ─────────────────────────────────────────────────────────

function monthStart(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

function shiftMonth(first: ISODate, by: number): ISODate {
  const d = new Date(toUTC(first));
  d.setUTCMonth(d.getUTCMonth() + by, 1);
  return d.toISOString().slice(0, 10);
}

function monthEnd(first: ISODate): ISODate {
  return addDays(shiftMonth(first, 1), -1);
}

function monthLabel(first: ISODate): string {
  const d = new Date(toUTC(first));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Saturday, November 14" */
function longDay(date: ISODate): string {
  const d = new Date(toUTC(date));
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function bookedSet(ranges: BookedRange[]): Set<ISODate> {
  const set = new Set<ISODate>();
  for (const r of ranges) for (const d of eachDay(r.start, r.end)) set.add(d);
  return set;
}

/**
 * Client-side check for fast feedback (Convex re-validates everything):
 * end ≥ start, ≤ 14 days, start not in the past, no overlap with an approved
 * booking ("Booked Nov 8–9. Pick dates after Nov 9."). Null when fine or incomplete.
 */
export function rangeSelectionError(value: DateRangeValue, booked: BookedRange[], today: ISODate): string | null {
  const { start, end } = value;
  if (!start || !end) return null;
  const err = validateRange(start, end, today);
  if (err) return RANGE_ERROR_COPY[err];
  const hit = booked.find((r) => r.start <= end && r.end >= start);
  if (hit) return `Booked ${fmtRangeShort(hit.start, hit.end)}. Pick dates after ${fmtDay(hit.end)}.`;
  return null;
}

// ─── Month grid ───────────────────────────────────────────────────────────

type DayState = {
  iso: ISODate;
  past: boolean;
  booked: boolean;
  today: boolean;
  selectedEnd: boolean;
  inRange: boolean;
};

function useMonthDays(first: ISODate, today: ISODate, booked: Set<ISODate>, value?: DateRangeValue) {
  return useMemo(() => {
    const lead = new Date(toUTC(first)).getUTCDay();
    const days: DayState[] = eachDay(first, monthEnd(first)).map((iso) => {
      const lo = value?.start && value.end && value.start <= value.end ? value.start : null;
      const hi = lo ? value!.end : null;
      return {
        iso,
        past: iso < today,
        booked: booked.has(iso),
        today: iso === today,
        selectedEnd: !!value && (iso === value.start || iso === value.end),
        inRange: !!lo && !!hi && iso > lo && iso < hi,
      };
    });
    return { lead, days };
  }, [first, today, booked, value]);
}

function Weekdays({ dense }: { dense?: boolean }) {
  return (
    <>
      {WEEKDAYS.map((d) => (
        <abbr
          key={d}
          title={d}
          className={cn(
            "text-center text-xs font-medium text-muted-foreground no-underline",
            dense ? "py-0.5" : "py-1",
          )}
        >
          {d.slice(0, 2)}
        </abbr>
      ))}
    </>
  );
}

// ─── DateRangePicker ──────────────────────────────────────────────────────

export type DateRangePickerProps = {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Approved loans only (ToolDetailDTO.bookedRanges); pending requests never block days. */
  bookedRanges: BookedRange[];
  /** App today (clientToday()). Past days are disabled. */
  today: ISODate;
  /**
   * Error under the calendar. Overrides the built-in range check; use it for
   * server errors ("Those dates were just booked. Pick new dates.") and links
   * ("… View request"). Pass `null` to show nothing even if the range is invalid.
   */
  error?: ReactNode;
  /** 1 or 2 months side by side; "auto" = 2 on ≥768px, 1 on mobile (the request sheet). */
  months?: 1 | 2 | "auto";
  /** How far ahead the user can page, in months after the current one (default 3). */
  monthsAhead?: number;
  /** Start / End summary buttons above the calendar (default true). */
  showFields?: boolean;
  /** "Booked · Available · Today" legend (default true). */
  showLegend?: boolean;
  className?: string;
};

/**
 * Range picker (brief A8/B4): pick a start, then an end. Past days and booked
 * days are disabled but stay focusable and announce "Booked". Arrow keys move
 * by day/week, Home/End jump to the first/last visible day, Enter/Space picks.
 * Max 14 days ("Up to 14 days"); a summary line shows "Sat, Nov 14 → Mon, Nov 16 · 3 days".
 */
export function DateRangePicker({
  value,
  onChange,
  bookedRanges,
  today,
  error,
  months = "auto",
  monthsAhead = 3,
  showFields = true,
  showLegend = true,
  className,
}: DateRangePickerProps) {
  const desktop = useIsDesktop();
  const count = months === "auto" ? (desktop ? 2 : 1) : months;
  const firstAllowed = monthStart(today);
  const lastAllowed = shiftMonth(firstAllowed, monthsAhead);

  const [field, setField] = useState<"start" | "end">(value.start && !value.end ? "end" : "start");
  const [view, setView] = useState<ISODate>(() => monthStart(value.start ?? today));
  const [focusDay, setFocusDay] = useState<ISODate>(value.start ?? today);
  const shouldFocus = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const booked = useMemo(() => bookedSet(bookedRanges), [bookedRanges]);
  const visible = Array.from({ length: count }, (_, i) => shiftMonth(view, i));
  const visibleFirst = visible[0];
  const visibleLast = monthEnd(visible[visible.length - 1]);
  const canPrev = view > firstAllowed;
  const canNext = shiftMonth(view, count - 1) < lastAllowed;

  // Keep the roving tab stop inside the visible months.
  const tabDay = focusDay >= visibleFirst && focusDay <= visibleLast ? focusDay : visibleFirst;

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${tabDay}"]`)?.focus();
  }, [tabDay, view]);

  const pick = (iso: ISODate) => {
    if (field === "start" || !value.start) {
      onChange({ start: iso, end: value.end && value.end >= iso ? value.end : null });
      setField("end");
    } else {
      onChange({ start: value.start, end: iso });
    }
    setFocusDay(iso);
  };

  const moveFocus = (to: ISODate) => {
    if (to < firstAllowed || to > monthEnd(lastAllowed)) return;
    shouldFocus.current = true;
    setFocusDay(to);
    if (to < visibleFirst) setView(monthStart(to));
    else if (to > visibleLast) setView(shiftMonth(monthStart(to), -(count - 1)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, iso: ISODate) => {
    const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 } as Record<string, number>)[e.key];
    let to: ISODate | null = null;
    if (step) to = addDays(iso, step);
    else if (e.key === "Home") to = visibleFirst;
    else if (e.key === "End") to = visibleLast;
    if (to) {
      e.preventDefault();
      moveFocus(to);
    }
  };

  const shownError = error !== undefined ? error : rangeSelectionError(value, bookedRanges, today);
  const hasRange = !!value.start && !!value.end && value.end >= value.start;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {showFields ? (
        <div role="group" aria-label="Dates" className="grid grid-cols-2 gap-2">
          <FieldButton label="Start" value={value.start} active={field === "start"} onClick={() => setField("start")} />
          <FieldButton label="End" value={value.end} active={field === "end"} onClick={() => setField("end")} />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <NavButton dir="prev" disabled={!canPrev} onClick={() => setView(shiftMonth(view, -1))} />
          <p aria-live="polite" className="m-0 font-semibold">
            {visible.map(monthLabel).join(" – ")}
          </p>
          <NavButton dir="next" disabled={!canNext} onClick={() => setView(shiftMonth(view, 1))} />
        </div>

        <div ref={gridRef} className={cn("grid gap-x-8 gap-y-4", count === 2 && "grid-cols-2")}>
          {visible.map((first) => (
            <MonthGrid
              key={first}
              first={first}
              today={today}
              booked={booked}
              value={value}
              showTitle={count === 2}
              tabDay={tabDay}
              onPick={pick}
              onKeyDown={onKeyDown}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Info aria-hidden className="size-3.5" />
            Up to {MAX_LOAN_DAYS} days
          </span>
          {value.start || value.end ? (
            <button
              type="button"
              onClick={() => {
                onChange({ start: null, end: null });
                setField("start");
              }}
              className="min-h-11 cursor-pointer border-0 bg-transparent px-0 font-semibold text-primary hover:text-primary-hover md:min-h-8"
            >
              Clear dates
            </button>
          ) : null}
        </div>
        {showLegend ? <CalendarLegend /> : null}
      </div>

      {shownError ? (
        <div role="alert" className="flex items-start gap-2 leading-[1.45] font-medium text-danger">
          <CircleExclamationPoint aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{shownError}</span>
        </div>
      ) : null}

      {hasRange ? (
        <p className="m-0 border-t border-border pt-3.5 text-[15px] font-medium tabular">
          <time dateTime={value.start!}>{fmtDayWithWeekday(value.start!)}</time> →{" "}
          <time dateTime={value.end!}>{fmtDayWithWeekday(value.end!)}</time>
          <span className="font-normal text-muted-foreground"> · {fmtDayCount(value.start!, value.end!)}</span>
        </p>
      ) : null}
    </div>
  );
}

function FieldButton({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: ISODate | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-[52px] min-w-0 cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-left",
        active ? "border-primary bg-primary-subtle" : "border-control-border bg-card",
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "truncate font-semibold tabular",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {value ? fmtDayWithWeekday(value) : "Add date"}
      </span>
    </button>
  );
}

function NavButton({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const label = dir === "prev" ? "Previous month" : "Next month";
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        className={cn(
          "grid size-11 place-items-center rounded-md border border-border bg-card md:size-10",
          disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-muted",
        )}
      >
        <Icon aria-hidden className="size-4" />
      </button>
    </Tooltip>
  );
}

function MonthGrid({
  first,
  today,
  booked,
  value,
  showTitle,
  tabDay,
  onPick,
  onKeyDown,
}: {
  first: ISODate;
  today: ISODate;
  booked: Set<ISODate>;
  value: DateRangeValue;
  showTitle: boolean;
  tabDay: ISODate;
  onPick: (iso: ISODate) => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>, iso: ISODate) => void;
}) {
  const { lead, days } = useMonthDays(first, today, booked, value);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {showTitle ? <p className="sr-only">{monthLabel(first)}</p> : null}
      <div className="grid grid-cols-7 gap-0.5">
        <Weekdays />
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const disabled = d.past || d.booked;
          const label =
            longDay(d.iso) +
            (d.today ? ", today" : "") +
            (d.booked ? ", Booked" : d.past ? ", past" : "") +
            (d.selectedEnd || d.inRange ? ", selected" : "");
          const button = (
            <button
              type="button"
              data-day={d.iso}
              aria-label={label}
              aria-disabled={disabled || undefined}
              aria-pressed={d.selectedEnd || d.inRange}
              tabIndex={d.iso === tabDay ? 0 : -1}
              onClick={disabled ? undefined : () => onPick(d.iso)}
              onKeyDown={(e) => onKeyDown(e, d.iso)}
              className={cn(
                "h-11 w-full rounded-md border p-0 text-sm tabular transition-colors duration-150 md:h-10",
                "border-transparent bg-transparent text-foreground",
                d.past && "text-muted-foreground",
                d.booked && cn(HATCH, "text-muted-foreground"),
                disabled ? "cursor-default" : "cursor-pointer hover:bg-muted",
                d.inRange && "bg-primary-subtle hover:bg-primary-subtle",
                d.selectedEnd && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                d.today && !d.selectedEnd && "border-[1.5px] border-foreground font-semibold",
              )}
            >
              {Number(d.iso.slice(8))}
            </button>
          );
          return (
            <span key={d.iso} className="flex">
              {d.booked ? <Tooltip content="Booked">{button}</Tooltip> : button}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** "Booked · Available · Today" swatches. */
export function CalendarLegend({ className }: { className?: string }) {
  return (
    <div aria-label="Legend" className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className={cn("size-3.5 rounded-[4px]", HATCH)} />
        Booked
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-3.5 rounded-[4px] border border-border bg-card" />
        Available
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-3.5 rounded-[4px] border-[1.5px] border-foreground" />
        Today
      </span>
    </div>
  );
}

// ─── Read-only availability calendar (tool detail) ────────────────────────

export type AvailabilityCalendarProps = {
  bookedRanges: BookedRange[];
  today: ISODate;
  /** Months shown from today's month (default 2: side by side on ≥640px). */
  months?: number;
  className?: string;
};

/**
 * Tool detail "Availability": static months, booked days hatched with a
 * "Booked" tooltip. Carries no borrower information (ranges only).
 */
export function AvailabilityCalendar({ bookedRanges, today, months = 2, className }: AvailabilityCalendarProps) {
  const booked = useMemo(() => bookedSet(bookedRanges), [bookedRanges]);
  const firsts = Array.from({ length: months }, (_, i) => shiftMonth(monthStart(today), i));
  return (
    <div className={cn("grid gap-x-8 gap-y-4 sm:grid-cols-2", className)}>
      {firsts.map((first) => (
        <ViewMonth key={first} first={first} today={today} booked={booked} />
      ))}
    </div>
  );
}

function ViewMonth({ first, today, booked }: { first: ISODate; today: ISODate; booked: Set<ISODate> }) {
  const { lead, days } = useMonthDays(first, today, booked);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="m-0 font-semibold">{monthLabel(first)}</p>
      <div className="grid grid-cols-7 gap-[3px]">
        <Weekdays dense />
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const label =
            longDay(d.iso) + (d.today ? ", today" : "") + (d.booked ? ", Booked" : d.past ? ", past" : ", available");
          const cell = (
            <span
              role="img"
              aria-label={label}
              tabIndex={d.booked ? 0 : undefined}
              className={cn(
                "grid h-9 place-items-center rounded-sm border text-[13px] tabular",
                d.past
                  ? "border-transparent bg-transparent text-muted-foreground"
                  : "border-border bg-card text-foreground",
                d.booked && cn(HATCH, "border-transparent text-muted-foreground"),
                d.today && "border-[1.5px] border-foreground font-semibold",
              )}
            >
              {Number(d.iso.slice(8))}
            </span>
          );
          return d.booked ? (
            <Tooltip key={d.iso} content="Booked">
              {cell}
            </Tooltip>
          ) : (
            <span key={d.iso} className="contents">
              {cell}
            </span>
          );
        })}
      </div>
    </div>
  );
}
