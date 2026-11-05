"use client";

import { DropdownMenu as MenuPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

/** 12px-radius popover card with 6px padding (card "⋯" menu: 232px, avatar menu: 272px). */
export function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = "end",
  collisionPadding = 12,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 w-[232px] max-w-[calc(100vw-24px)] rounded-lg border border-border bg-popover p-1.5 text-foreground shadow-ll-pop animate-ll-in",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

const itemClasses = cn(
  "flex w-full min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left font-medium outline-none select-none md:min-h-9",
  "data-[highlighted]:bg-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55",
  "[&_svg]:size-4 [&_svg]:shrink-0",
);

export function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: ComponentProps<typeof MenuPrimitive.Item> & { variant?: "default" | "destructive" }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(itemClasses, variant === "destructive" ? "text-destructive" : "text-foreground", className)}
      {...props}
    />
  );
}

export function DropdownMenuRadioItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return <MenuPrimitive.RadioItem className={cn(itemClasses, className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn("px-2.5 py-1.5 text-xs font-semibold text-muted-foreground", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
