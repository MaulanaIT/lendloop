import { diffDays, fmtDay, rangeDays, type ISODate } from "./dates";

/** What the database stores. "overdue", "upcoming" and "on_loan" are never written. */
export const STORED_LOAN_STATUSES = ["pending", "approved", "returned", "declined", "cancelled"] as const;
export type StoredLoanStatus = (typeof STORED_LOAN_STATUSES)[number];

/** What every screen, filter and the n8n overdue endpoint reason about. */
export const LOAN_STATUSES = [
  "pending",
  "upcoming",
  "on_loan",
  "overdue",
  "returned",
  "declined",
  "cancelled",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  pending: "Pending",
  upcoming: "Approved",
  on_loan: "On loan",
  overdue: "Overdue",
  returned: "Returned",
  declined: "Declined",
  cancelled: "Cancelled",
};

export type LoanDates = {
  status: StoredLoanStatus;
  startDate: ISODate;
  endDate: ISODate;
};

/**
 * Single source of truth for a loan's live status. Overdue is derived:
 * approved, not returned, and today is after the end date.
 */
export function deriveLoanStatus(loan: LoanDates, today: ISODate): LoanStatus {
  switch (loan.status) {
    case "approved":
      if (today > loan.endDate) return "overdue";
      if (today >= loan.startDate) return "on_loan";
      return "upcoming";
    default:
      return loan.status;
  }
}

export function isOverdue(loan: LoanDates, today: ISODate): boolean {
  return deriveLoanStatus(loan, today) === "overdue";
}

/** Days past the end date; 0 when not overdue. */
export function daysOverdue(loan: LoanDates, today: ISODate): number {
  return isOverdue(loan, today) ? diffDays(today, loan.endDate) : 0;
}

/** Statuses where the tool is (or will be) with the borrower. */
export function isActive(status: LoanStatus): boolean {
  return status === "upcoming" || status === "on_loan" || status === "overdue";
}

/** Statuses where the counterpart's contact email is shared. */
export function contactUnlocked(status: LoanStatus): boolean {
  return isActive(status);
}

/**
 * Badge text, e.g. "Approved · starts Nov 8", "On loan · due Nov 6",
 * "Due today", "Overdue · 2 days", "Returned Oct 20".
 */
export function loanStatusLabel(
  loan: LoanDates & { returnedOn?: ISODate | null },
  today: ISODate,
): string {
  const s = deriveLoanStatus(loan, today);
  switch (s) {
    case "upcoming":
      return `Approved · starts ${fmtDay(loan.startDate)}`;
    case "on_loan":
      return loan.endDate === today ? "Due today" : `On loan · due ${fmtDay(loan.endDate)}`;
    case "overdue": {
      const d = diffDays(today, loan.endDate);
      return `Overdue · ${d} ${d === 1 ? "day" : "days"}`;
    }
    case "returned":
      return loan.returnedOn ? `Returned ${fmtDay(loan.returnedOn)}` : "Returned";
    default:
      return LOAN_STATUS_LABEL[s];
  }
}

export const MAX_LOAN_DAYS = 14;

export type RangeError = "INVALID_DATE" | "START_IN_PAST" | "END_BEFORE_START" | "TOO_LONG";

export const RANGE_ERROR_COPY: Record<RangeError, string> = {
  INVALID_DATE: "Pick a start and end date.",
  START_IN_PAST: "Start date can't be in the past.",
  END_BEFORE_START: "End date must be on or after the start date.",
  TOO_LONG: `Requests can be up to ${MAX_LOAN_DAYS} days.`,
};

/** start ≥ today, end ≥ start, at most 14 days (same day = 1 day). */
export function validateRange(start: ISODate, end: ISODate, today: ISODate): RangeError | null {
  if (!start || !end) return "INVALID_DATE";
  if (start < today) return "START_IN_PAST";
  if (end < start) return "END_BEFORE_START";
  if (rangeDays(start, end) > MAX_LOAN_DAYS) return "TOO_LONG";
  return null;
}

export function rangesOverlap(
  a: { startDate: ISODate; endDate: ISODate },
  b: { startDate: ISODate; endDate: ISODate },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}
