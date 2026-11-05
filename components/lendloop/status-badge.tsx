import {
  Ban,
  CalendarCheck,
  CircleX,
  Clock,
  PackageCheck,
  Repeat,
  TriangleExclamationPoint,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { LoanStatus } from "@/lib/domain/status";
import { cn } from "@/lib/utils";

const STATUS: Record<LoanStatus, { icon: LucideIcon; classes: string }> = {
  pending: {
    icon: Clock,
    classes: "border-[var(--st-pending-border)] bg-[var(--st-pending-bg)] text-[var(--st-pending-text)]",
  },
  upcoming: {
    icon: CalendarCheck,
    classes: "border-[var(--st-approved-border)] bg-[var(--st-approved-bg)] text-[var(--st-approved-text)]",
  },
  on_loan: {
    icon: Repeat,
    classes: "border-[var(--st-onloan-border)] bg-[var(--st-onloan-bg)] text-[var(--st-onloan-text)]",
  },
  overdue: {
    icon: TriangleExclamationPoint,
    classes: "border-[var(--st-overdue-border)] bg-[var(--st-overdue-bg)] text-[var(--st-overdue-text)]",
  },
  returned: {
    icon: PackageCheck,
    classes: "border-[var(--st-returned-border)] bg-[var(--st-returned-bg)] text-[var(--st-returned-text)]",
  },
  declined: {
    icon: CircleX,
    classes: "border-[var(--st-declined-border)] bg-[var(--st-declined-bg)] text-[var(--st-declined-text)]",
  },
  cancelled: {
    icon: Ban,
    classes: "border-[var(--st-cancelled-border)] bg-[var(--st-cancelled-bg)] text-[var(--st-cancelled-text)]",
  },
};

export const STATUS_ICON: Record<LoanStatus, LucideIcon> = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, v.icon]),
) as Record<LoanStatus, LucideIcon>;

const SIZE = {
  /** 22px / 12px: admin tables and compact rows. */
  sm: "h-[22px] gap-1 px-2 text-xs [&_svg]:size-3",
  /** 26px / 13px: loan rows, loan detail header (default). */
  md: "h-[26px] gap-1.5 px-2.5 text-[13px] [&_svg]:size-4",
} as const;

export type StatusBadgeProps = {
  status: LoanStatus;
  /** Full text, usually from loanBadgeLabel() in lib/copy.ts ("Overdue · 2 days", "Approved · starts Nov 8"). */
  label: string;
  size?: keyof typeof SIZE;
  className?: string;
};

/**
 * Loan status pill: always icon + text, never color only (brief B17). For
 * cancelled loans also strike through the date range next to it
 * (`STRIKE_CANCELLED` / `datesClassName(status)`).
 */
export function StatusBadge({ status, label, size = "md", className }: StatusBadgeProps) {
  const { icon: Icon, classes } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border font-medium whitespace-nowrap tabular [&_svg]:shrink-0",
        SIZE[size],
        classes,
        className,
      )}
    >
      <Icon aria-hidden />
      {label}
    </span>
  );
}

/** Class for the "Oct 31 → Nov 3" span next to a badge: struck through when cancelled. */
export function datesClassName(status: LoanStatus): string {
  return status === "cancelled" ? "line-through" : "";
}

/** Neutral chip shown while the borrower has reported a return the owner hasn't confirmed. */
export function ReturnReportedChip({ size = "md", className }: { size?: keyof typeof SIZE; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-[var(--st-reported-border)] bg-[var(--st-reported-bg)] font-medium whitespace-nowrap text-[var(--st-reported-text)] [&_svg]:shrink-0",
        SIZE[size],
        className,
      )}
    >
      <Undo2 aria-hidden />
      Return reported
    </span>
  );
}
