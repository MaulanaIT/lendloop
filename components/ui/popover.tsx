"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

/** Popover card (e.g. the Trusted Lender confirm in Admin · Users). Focus moves in and returns on close. */
export function PopoverContent({
  className,
  sideOffset = 8,
  align = "end",
  collisionPadding = 12,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 w-72 max-w-[calc(100vw-24px)] rounded-lg border border-border bg-popover p-4 text-foreground shadow-ll-pop animate-ll-in",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
