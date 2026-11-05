import { Ban, CalendarCheck, CircleCheck, Repeat, TriangleExclamationPoint, type LucideIcon } from "lucide-react";
import { availabilityLabel, type Availability } from "@/lib/domain/availability";
import type { ISODate } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";

const KIND: Record<Availability["kind"], { icon: LucideIcon; classes: string }> = {
  available: { icon: CircleCheck, classes: "border-success-border bg-success-bg text-success" },
  booked: { icon: CalendarCheck, classes: "border-info-border bg-info-bg text-info" },
  on_loan: {
    icon: Repeat,
    classes: "border-[var(--st-onloan-border)] bg-[var(--st-onloan-bg)] text-[var(--st-onloan-text)]",
  },
  overdue: { icon: TriangleExclamationPoint, classes: "border-danger-border bg-danger-bg text-danger" },
  removed: {
    icon: Ban,
    classes: "border-[var(--st-declined-border)] bg-[var(--st-declined-bg)] text-[var(--st-declined-text)]",
  },
};

const SIZE = {
  /** 24px min, 12px text: tool cards and table cells (default). */
  sm: "min-h-6 gap-1.5 px-2.5 py-0.5 text-xs [&_svg]:size-3",
  /** 26px, 13px text: tool detail header, mobile request bar. */
  md: "min-h-[26px] gap-1.5 px-2.5 text-[13px] [&_svg]:size-4",
} as const;

export type AvailabilityPillProps = {
  /** Server-computed per viewer: non-owners never get "overdue" (they see "On loan"). */
  availability: Availability;
  /** App "today" (clientToday()) so "On loan · back today" reads right. */
  today?: ISODate;
  size?: keyof typeof SIZE;
  className?: string;
};

/** "Available" · "Booked from Nov 8" · "On loan · back Nov 6" · "Overdue · 2 days" · "Removed". */
export function AvailabilityPill({ availability, today, size = "sm", className }: AvailabilityPillProps) {
  const { icon: Icon, classes } = KIND[availability.kind];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border text-right font-medium tabular [&_svg]:shrink-0",
        SIZE[size],
        classes,
        className,
      )}
    >
      <Icon aria-hidden />
      {availabilityLabel(availability, today)}
    </span>
  );
}
