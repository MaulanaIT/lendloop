import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** 12px radius, 1px border, warm card shadow (none in dark mode). Padding is up to the caller (p-5 by default in the prototype). */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("min-w-0 rounded-lg border border-border bg-card text-foreground shadow-ll-card", className)}
      {...props}
    />
  );
}

/** Section title inside a card: 16px semibold ("Activity", "People"). */
export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("m-0 text-base font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("m-0 text-[13px] text-muted-foreground", className)} {...props} />;
}
