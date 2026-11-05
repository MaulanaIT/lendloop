import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Pill used by every chip in the app (status, delivery, role, tags).
 * Tones map to the semantic tokens; status-specific colors live in StatusBadge.
 */
export const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border tabular [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-border bg-card text-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
        muted: "border-[var(--st-reported-border)] bg-[var(--st-reported-bg)] text-[var(--st-reported-text)]",
        slate: "border-[var(--st-declined-border)] bg-[var(--st-declined-bg)] text-[var(--st-declined-text)]",
        success: "border-success-border bg-success-bg text-success",
        warning: "border-warning-border bg-warning-bg text-warning",
        danger: "border-danger-border bg-danger-bg text-danger",
        info: "border-info-border bg-info-bg text-info",
        trusted: "border-trusted-border bg-trusted-bg text-trusted",
        admin: "border-admin-bg bg-admin-bg text-admin",
        primary: "border-primary bg-primary-subtle text-foreground",
      },
      size: {
        /** 22px, 12px text: delivery chips, "Your tool", role pills. */
        sm: "h-[22px] gap-1 px-2 text-xs [&_svg]:size-3",
        /** 24px, 12px text: availability pills, category chips on cards. */
        md: "min-h-6 px-2.5 py-0.5 text-xs [&_svg]:size-3",
        /** 26px, 13px text: loan status badges. */
        lg: "h-[26px] px-2.5 text-[13px] [&_svg]:size-4",
      },
      weight: {
        medium: "font-medium",
        semibold: "font-semibold",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm", weight: "medium" },
  },
);

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, size, weight, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone, size, weight }), className)} {...props} />;
}

/** Small numeric count bubble for nav items and tabs ("2"). */
export function CountBadge({
  count,
  tone = "primary",
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & { count: number; tone?: "primary" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular",
        tone === "danger" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
        className,
      )}
      {...props}
    >
      {count}
    </span>
  );
}
