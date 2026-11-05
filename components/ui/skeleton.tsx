import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Muted pulse block. Size it with width/height classes; rounded-sm (6px) by default, rounded-full for chips. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn("rounded-sm bg-muted animate-pulse motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
