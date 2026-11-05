"use client";

import { BadgeCheck } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { TRUSTED_TOOLTIP } from "@/lib/copy";
import { cn } from "@/lib/utils";

export type TrustedLenderBadgeProps = {
  /**
   * sm: icon only (16px, trusted-icon color), focusable, tooltip + aria-label — cards and rows.
   * md: 22px pill with icon + text — menus, people cards, admin tables.
   */
  size?: "sm" | "md";
  /** md text; the loan detail People card uses the short "Trusted". */
  label?: "Trusted Lender" | "Trusted";
  /** md only: show the explanatory tooltip too (default true). */
  withTooltip?: boolean;
  className?: string;
};

/** Admin-granted Trusted Lender badge (BadgeCheck). Explanation in TRUSTED_TOOLTIP. */
export function TrustedLenderBadge({
  size = "sm",
  label = "Trusted Lender",
  withTooltip = true,
  className,
}: TrustedLenderBadgeProps) {
  if (size === "sm") {
    return (
      <Tooltip content={TRUSTED_TOOLTIP}>
        <span
          tabIndex={0}
          role="img"
          aria-label={TRUSTED_TOOLTIP}
          className={cn("inline-flex shrink-0 rounded-sm text-trusted-icon", className)}
        >
          <BadgeCheck aria-hidden className="size-4" />
        </span>
      </Tooltip>
    );
  }
  const pill = (
    <span
      tabIndex={withTooltip ? 0 : undefined}
      aria-label={withTooltip ? TRUSTED_TOOLTIP : undefined}
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border border-trusted-border bg-trusted-bg pr-2 pl-1.5 text-xs font-medium whitespace-nowrap text-trusted",
        label === "Trusted" && "font-semibold",
        className,
      )}
    >
      <BadgeCheck aria-hidden className="size-3.5 text-trusted-icon" />
      {label}
    </span>
  );
  return withTooltip ? <Tooltip content={TRUSTED_TOOLTIP}>{pill}</Tooltip> : pill;
}
