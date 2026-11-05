"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root> & {
  /**
   * Visible label rendered inside the switch button ("Available only"), so the
   * whole row is one 44px target. Omit it and use aria-label / <Label htmlFor> instead.
   */
  children?: ReactNode;
  /** Put the label before the track (mobile filter sheet) instead of after it. */
  labelFirst?: boolean;
};

/** 36×20 track, 16px thumb; primary when on, control-border when off. */
export function Switch({ className, children, labelFirst = false, ...props }: SwitchProps) {
  const track = (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-control-border transition-colors duration-150",
        "group-data-[state=checked]/switch:bg-primary",
      )}
    >
      <SwitchPrimitive.Thumb className="absolute top-0.5 left-0.5 size-4 rounded-full bg-card shadow-ll-card transition-transform duration-150 data-[state=checked]:translate-x-4" />
    </span>
  );
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch inline-flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 font-medium text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-55",
        children ? "min-h-11 md:min-h-10" : "min-h-5",
        labelFirst && "justify-between text-left",
        className,
      )}
      {...props}
    >
      {labelFirst ? (
        <>
          {children}
          {track}
        </>
      ) : (
        <>
          {track}
          {children}
        </>
      )}
    </SwitchPrimitive.Root>
  );
}
