"use client";

import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type LabelProps = ComponentProps<typeof LabelPrimitive.Root> & {
  /** Muted suffix, e.g. "(required)" or "(optional)". */
  hint?: ReactNode;
};

export function Label({ className, hint, children, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root data-slot="label" className={cn("font-semibold text-foreground", className)} {...props}>
      {children}
      {hint ? <span className="font-normal text-muted-foreground"> {hint}</span> : null}
    </LabelPrimitive.Root>
  );
}
