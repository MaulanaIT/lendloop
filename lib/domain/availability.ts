import { diffDays, fmtDay, type ISODate } from "./dates";
import { deriveLoanStatus, type LoanDates } from "./status";

/**
 * Availability of a tool as seen by one viewer.
 * "Available" = not on loan or overdue today. Tools with only future bookings
 * still count as available ("Booked from Nov 8").
 */
export type Availability =
  | { kind: "available" }
  | { kind: "booked"; from: ISODate }
  | { kind: "on_loan"; until: ISODate | null }
  | { kind: "overdue"; days: number }
  | { kind: "removed" };

export function computeAvailability(
  loans: LoanDates[],
  today: ISODate,
  opts: { removed: boolean; privileged: boolean },
): Availability {
  if (opts.removed) return { kind: "removed" };
  const current = loans.find((l) => {
    const s = deriveLoanStatus(l, today);
    return s === "on_loan" || s === "overdue";
  });
  if (current) {
    if (today > current.endDate) {
      // Non-owners only see "On loan" — the borrower and due date stay private.
      return opts.privileged
        ? { kind: "overdue", days: diffDays(today, current.endDate) }
        : { kind: "on_loan", until: null };
    }
    return { kind: "on_loan", until: current.endDate };
  }
  const upcoming = loans
    .filter((l) => deriveLoanStatus(l, today) === "upcoming")
    .map((l) => l.startDate)
    .sort();
  if (upcoming.length) return { kind: "booked", from: upcoming[0] };
  return { kind: "available" };
}

export function isAvailableNow(a: Availability): boolean {
  return a.kind === "available" || a.kind === "booked";
}

export function availabilityLabel(a: Availability, today?: ISODate): string {
  switch (a.kind) {
    case "available":
      return "Available";
    case "booked":
      return `Booked from ${fmtDay(a.from)}`;
    case "on_loan":
      if (!a.until) return "On loan";
      return today && a.until === today ? "On loan · back today" : `On loan · back ${fmtDay(a.until)}`;
    case "overdue":
      return `Overdue · ${a.days} ${a.days === 1 ? "day" : "days"}`;
    case "removed":
      return "Removed";
  }
}

/**
 * Day ranges that can't be requested: approved loans (upcoming / on loan).
 * An overdue loan blocks through today. Pending requests do NOT block.
 * Contains no borrower information.
 */
export function bookedRanges(loans: LoanDates[], today: ISODate): { start: ISODate; end: ISODate }[] {
  return loans
    .filter((l) => {
      const s = deriveLoanStatus(l, today);
      return s === "upcoming" || s === "on_loan" || s === "overdue";
    })
    .map((l) => ({ start: l.startDate, end: l.endDate < today ? today : l.endDate }))
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}
