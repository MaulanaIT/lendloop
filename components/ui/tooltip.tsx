"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Optional app-wide provider; every Tooltip also works on its own. */
export function TooltipProvider(props: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={200} skipDelayDuration={300} {...props} />;
}

export type TooltipProps = {
  /** Tooltip text. Nothing renders when empty. */
  content: ReactNode;
  /** A single focusable element (button, link, or an element with tabIndex). */
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/**
 * Dark tooltip from the prototype: bg-foreground / text-background, 12px.
 * Radix wires aria-describedby, Esc to close and hover/focus triggers.
 */
export function Tooltip({ content, children, side = "top", align = "center", open, onOpenChange, className }: TooltipProps) {
  if (content == null || content === "") return <>{children}</>;
  return (
    <TooltipPrimitive.Provider delayDuration={200} skipDelayDuration={300}>
      <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={8}
            collisionPadding={8}
            className={cn(
              "z-[90] w-max max-w-60 rounded-sm bg-foreground px-2 py-1.5 text-left text-xs leading-[1.4] font-normal text-background",
              "animate-ll-in",
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
