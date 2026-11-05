import { CircleExclamationPoint } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Vertical stack for label + control + helper/error (6px gap, as in the prototype forms). */
export function Field({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

/** Muted helper text. Give it an id and reference it with aria-describedby. */
export function FieldHint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("m-0 text-[13px] text-muted-foreground text-pretty", className)} {...props} />;
}

/**
 * Inline field error, announced via role="alert". Link it to the control with
 * aria-describedby and set aria-invalid on the control. Renders nothing when empty.
 */
export function FieldError({ id, children, className }: { id?: string; children?: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className={cn("m-0 flex items-start gap-1.5 text-[13px] font-medium text-danger", className)}>
      <CircleExclamationPoint aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** "12/60" character counter; turns red past the limit. */
export function FieldCounter({ id, value, max, className }: { id?: string; value: number; max: number; className?: string }) {
  return (
    <span
      id={id}
      className={cn("text-xs tabular", value > max ? "font-semibold text-danger" : "text-muted-foreground", className)}
    >
      {value}/{max}
    </span>
  );
}
