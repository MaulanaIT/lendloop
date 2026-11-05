"use client";

import { Check, TriangleExclamationPoint, Zap } from "lucide-react";
import { automationLineText } from "@/lib/copy";
import { APP_TIME_ZONE } from "@/lib/config";
import { fmtRelative } from "@/lib/domain/dates";
import type { AutomationLineDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";
import { useNow } from "./use-now";

export type AutomationLineProps = {
  /** LoanRowDTO.lastAutomation. Renders nothing when null. */
  automation: AutomationLineDTO | null;
  nowMs?: number;
  /**
   * Append when it happened instead of the check icon: "Owner notified · 2h ago"
   * (owner's pending rows on Incoming).
   */
  withTime?: boolean;
  className?: string;
};

/**
 * Muted "⚡ Owner notified ✓" line under a loan row. Retrying turns amber and
 * failures red with a warning icon; users never see attempt counts here.
 */
export function AutomationLine({ automation, nowMs, withTime = false, className }: AutomationLineProps) {
  const ticking = useNow();
  if (!automation) return null;
  const now = nowMs ?? ticking;
  const line = automationLineText(automation, now);
  const timed = withTime && line.check; // delivered notifications only
  const text = timed ? `${line.text} · ${fmtRelative(automation.at, now, APP_TIME_ZONE)}` : line.text;
  const { tone } = line;
  const check = line.check && !timed;
  const Icon = tone === "muted" ? Zap : TriangleExclamationPoint;
  return (
    <p
      className={cn(
        "m-0 flex items-start gap-1.5 text-[13px]",
        tone === "muted" && "text-muted-foreground",
        tone === "warning" && "text-warning",
        tone === "danger" && "font-semibold text-danger",
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {tone === "muted" ? <span className="sr-only">Automated: </span> : null}
        {text}
      </span>
      {check ? <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" /> : null}
    </p>
  );
}
