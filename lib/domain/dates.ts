// Calendar dates are plain "YYYY-MM-DD" strings (a loan runs from a start day
// to an end day, inclusive). Arithmetic happens in UTC so it never drifts with
// the runtime's local timezone; "today" is resolved in the neighborhood's
// timezone (APP_TIME_ZONE / NEXT_PUBLIC_APP_TIME_ZONE).

export type ISODate = string;

export const DEFAULT_TIME_ZONE = "Asia/Jakarta";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const t = toUTC(value);
  return !Number.isNaN(t) && fromUTC(t) === value;
}

export function toUTC(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The calendar date of `nowMs` in `timeZone`. */
export function todayISO(nowMs: number, timeZone: string = DEFAULT_TIME_ZONE): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/** Whole days from `b` to `a` (a − b). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
}

/** Inclusive day count of a range; the same day counts as 1. */
export function rangeDays(start: ISODate, end: ISODate): number {
  return diffDays(end, start) + 1;
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let t = toUTC(start); t <= toUTC(end); t += DAY_MS) out.push(fromUTC(t));
  return out;
}

/** "Nov 3" */
export function fmtDay(date: ISODate): string {
  const t = new Date(toUTC(date));
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`;
}

/** "Sat, Nov 14" */
export function fmtDayWithWeekday(date: ISODate): string {
  const t = new Date(toUTC(date));
  return `${DAYS[t.getUTCDay()]}, ${fmtDay(date)}`;
}

/** "Nov 8–9", "Oct 31 – Nov 3", or "Nov 8" for a single day. */
export function fmtRangeShort(start: ISODate, end: ISODate): string {
  if (start === end) return fmtDay(start);
  const a = new Date(toUTC(start));
  const b = new Date(toUTC(end));
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${fmtDay(start)}–${b.getUTCDate()}`
    : `${fmtDay(start)} – ${fmtDay(end)}`;
}

/** "3 days" / "1 day" */
export function fmtDayCount(start: ISODate, end: ISODate): string {
  const n = rangeDays(start, end);
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/** "Mar 2026" for "Lending since …" */
export function fmtMonthYear(ms: number, timeZone: string = DEFAULT_TIME_ZONE): string {
  const d = todayISO(ms, timeZone);
  const t = new Date(toUTC(d));
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}

/** "09:02" in the app timezone. */
export function fmtClock(ms: number, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

/**
 * Human relative time anchored to the app timezone's calendar:
 * "just now", "50m ago", "2h ago" (same day), "today 09:02", "yesterday 09:00",
 * otherwise "Oct 29, 14:02".
 */
export function fmtRelative(ms: number, nowMs: number, timeZone: string = DEFAULT_TIME_ZONE): string {
  const delta = nowMs - ms;
  if (delta >= 0 && delta < 60_000) return "just now";
  const today = todayISO(nowMs, timeZone);
  const day = todayISO(ms, timeZone);
  if (delta >= 0 && delta < 60 * 60_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (day === today && delta >= 0 && delta < 3 * 60 * 60_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  if (day === today) return `today ${fmtClock(ms, timeZone)}`;
  if (day === addDays(today, -1)) return `yesterday ${fmtClock(ms, timeZone)}`;
  return `${fmtDay(day)}, ${fmtClock(ms, timeZone)}`;
}

/** ISO string with time for <time dateTime>. */
export function isoDateTime(ms: number): string {
  return new Date(ms).toISOString();
}

/** Offset (ms) of `timeZone` from UTC at instant `ms`, e.g. +7h for Asia/Jakarta. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - Math.floor(ms / 1000) * 1000;
}

/** Epoch ms of a wall-clock time ("09:02" or "09:02:11") on `date` in `timeZone`. */
export function zonedTimeToMs(date: ISODate, time: string, timeZone: string = DEFAULT_TIME_ZONE): number {
  const [h = 0, m = 0, s = 0] = time.split(":").map(Number);
  const guess = toUTC(date) + ((h * 60 + m) * 60 + s) * 1000;
  // Two passes handle DST transitions; zones without DST settle on the first.
  const first = guess - zoneOffsetMs(guess, timeZone);
  return guess - zoneOffsetMs(first, timeZone);
}
