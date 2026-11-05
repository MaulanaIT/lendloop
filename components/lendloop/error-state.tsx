"use client";

import { OctagonExclamationPoint, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ErrorStateProps = {
  /** "Couldn't load your requests." */
  title: ReactNode;
  /** Reassurance: "Your search and filters are kept." (card variant only). */
  description?: ReactNode;
  /** One recovery action. Usually useAppQuery(...).retry. */
  onRetry?: () => void;
  retryLabel?: string;
  /**
   * card (default): list/page sections. compact: smaller card for side panels.
   * banner: red inline strip inside an existing card (loan activity).
   */
  variant?: "card" | "compact" | "banner";
  className?: string;
};

/** Inline load error with one Retry (brief B14 item 4). Never shows raw errors. */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Retry",
  variant = "card",
  className,
}: ErrorStateProps) {
  if (variant === "banner") {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md border border-danger-border bg-danger-bg px-4 py-3.5 text-danger",
          className,
        )}
      >
        <OctagonExclamationPoint aria-hidden className="size-5 shrink-0" />
        <p className="m-0 flex-[1_1_200px] font-medium">{title}</p>
        {onRetry ? (
          <Button
            variant="outline"
            onClick={onRetry}
            className="border-danger-border text-danger hover:bg-danger-bg hover:text-danger"
          >
            <RotateCw aria-hidden />
            {retryLabel}
          </Button>
        ) : null}
      </div>
    );
  }

  const compact = variant === "compact";
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center rounded-lg border border-danger-border bg-card shadow-ll-card",
        compact ? "gap-3 p-4" : "gap-4 p-5",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center rounded-tile bg-danger-bg text-danger",
          compact ? "size-9" : "size-10",
        )}
      >
        <OctagonExclamationPoint className={compact ? "size-[18px]" : "size-5"} />
      </span>
      <div className={cn("min-w-0", compact ? "flex-[1_1_160px]" : "flex-[1_1_220px]")}>
        <p className="m-0 font-semibold">{title}</p>
        {description && !compact ? <p className="m-0 mt-0.5 text-muted-foreground">{description}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size={compact ? "sm" : "md"} onClick={onRetry}>
          <RotateCw aria-hidden />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
