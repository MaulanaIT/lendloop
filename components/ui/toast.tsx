"use client";

import { CircleCheck, Info, OctagonExclamationPoint, TriangleExclamationPoint, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "info" | "warning" | "error" | "muted";

const TONE: Record<ToastTone, { icon: LucideIcon; color: string }> = {
  success: { icon: CircleCheck, color: "text-success" },
  info: { icon: Info, color: "text-info" },
  warning: { icon: TriangleExclamationPoint, color: "text-warning" },
  error: { icon: OctagonExclamationPoint, color: "text-destructive" },
  muted: { icon: Info, color: "text-muted-foreground" },
};

export type ToastViewProps = {
  tone: ToastTone;
  title: ReactNode;
  description?: ReactNode;
  /** Replaces the tone icon, e.g. LogIn for "Your session expired". */
  icon?: LucideIcon;
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
};

/** The prototype toast card: icon · title/description · optional action · dismiss X. */
export function ToastView({ tone, title, description, icon, action, onDismiss }: ToastViewProps) {
  const Icon = icon ?? TONE[tone].icon;
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-[min(360px,calc(100vw-24px))] items-start gap-2.5 rounded-lg border bg-popover py-3 pr-3 pl-3.5 font-sans text-sm text-foreground shadow-ll-pop",
        tone === "error" ? "border-danger-border" : "border-border",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", TONE[tone].color)} />
      <div className="min-w-0 flex-1">
        <p className="m-0 font-semibold">{title}</p>
        {description ? <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={() => {
            action.onClick();
            onDismiss();
          }}
          className="h-11 shrink-0 cursor-pointer rounded-md border border-control-border bg-card px-2.5 text-[13px] font-semibold whitespace-nowrap hover:bg-muted md:h-7"
        >
          {action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        title="Dismiss notification"
        className="-my-1.5 -mr-1.5 grid size-11 shrink-0 cursor-pointer place-items-center rounded-sm text-muted-foreground hover:bg-muted md:size-7"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
