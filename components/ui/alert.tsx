import { cva, type VariantProps } from "class-variance-authority";
import { CircleCheck, Info, OctagonExclamationPoint, TriangleExclamationPoint, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex flex-wrap items-center gap-x-4 gap-y-3 border text-pretty", {
  variants: {
    tone: {
      success: "border-success-border bg-success-bg text-success",
      warning: "border-warning-border bg-warning-bg text-warning",
      danger: "border-danger-border bg-danger-bg text-danger",
      info: "border-info-border bg-info-bg text-info",
      neutral: "border-border bg-muted text-foreground",
    },
    size: {
      /** 12px radius, 14×16 padding: page banners (overdue, degraded automation). */
      md: "rounded-lg px-4 py-3.5",
      /** 8px radius, 10×12 padding: inline notes inside cards and panels. */
      sm: "rounded-md px-3 py-2.5 text-[13px] leading-[1.45]",
    },
  },
  defaultVariants: { tone: "info", size: "md" },
});

const TONE_ICON: Record<NonNullable<VariantProps<typeof alertVariants>["tone"]>, LucideIcon> = {
  success: CircleCheck,
  warning: TriangleExclamationPoint,
  danger: OctagonExclamationPoint,
  info: Info,
  neutral: Info,
};

export type AlertProps = Omit<ComponentProps<"div">, "title"> &
  VariantProps<typeof alertVariants> & {
    /** Override the tone's default icon; pass null to hide it. */
    icon?: LucideIcon | null;
    title?: ReactNode;
    /** Right-aligned action (e.g. <Button variant="outline">View loan</Button>). */
    action?: ReactNode;
  };

/**
 * Banner / inline alert with an icon (status is never color-only).
 * Defaults to role="status"; pass role="alert" for errors that need to interrupt.
 */
export function Alert({
  className,
  tone = "info",
  size = "md",
  icon,
  title,
  action,
  children,
  role = "status",
  ...props
}: AlertProps) {
  const Icon = icon === null ? null : (icon ?? TONE_ICON[tone ?? "info"]);
  return (
    <div role={role} data-slot="alert" className={cn(alertVariants({ tone, size }), className)} {...props}>
      <div className="flex min-w-0 flex-[1_1_260px] items-start gap-2.5">
        {Icon ? <Icon aria-hidden className={cn("mt-0.5 shrink-0", size === "sm" ? "size-4" : "size-5")} /> : null}
        <div className="min-w-0 flex-1">
          {title ? <p className="m-0 font-semibold">{title}</p> : null}
          {children ? <div className={cn("m-0 font-medium", title && "mt-0.5 font-normal")}>{children}</div> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
