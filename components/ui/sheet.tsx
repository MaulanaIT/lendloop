"use client";

import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export type SheetContentProps = ComponentProps<typeof SheetPrimitive.Content> & {
  /**
   * "right": drawer (480px) on ≥768px, full screen on mobile (admin delivery detail).
   * "bottom": mobile bottom sheet with a grab handle (filters, request sheet).
   */
  side?: "right" | "bottom";
};

export function SheetContent({ className, side = "right", children, ...props }: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-[60] bg-overlay" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-[60] flex flex-col bg-popover text-foreground shadow-ll-pop animate-ll-in",
          side === "right" &&
            "inset-y-0 right-0 w-full overflow-y-auto md:w-[min(480px,100%)] md:border-l md:border-border",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[92vh] gap-4 overflow-y-auto rounded-t-2xl px-5 pt-2 pb-[calc(20px+env(safe-area-inset-bottom))]",
          className,
        )}
        {...props}
      >
        {side === "bottom" ? (
          <span aria-hidden className="h-1 w-9 shrink-0 self-center rounded-full bg-border" />
        ) : null}
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

/**
 * Title row with a 44px close button. In a right drawer it sticks to the top
 * (card surface + bottom border); in a bottom sheet it is a plain row.
 */
export function SheetHeader({
  className,
  children,
  closeLabel = "Close",
  sticky = true,
}: {
  className?: string;
  children: ReactNode;
  /** aria-label + tooltip of the X, e.g. "Close details" / "Close filters". */
  closeLabel?: string;
  /** Right drawers: sticky card-colored header. Pass false inside a bottom sheet. */
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3",
        sticky &&
          "sticky top-0 z-[1] border-b border-border bg-card py-3.5 pr-3 pl-5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">{children}</div>
      <SheetPrimitive.Close
        aria-label={closeLabel}
        title={closeLabel}
        className="-mr-1 grid size-11 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
      >
        <X aria-hidden className="size-5" />
      </SheetPrimitive.Close>
    </div>
  );
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("m-0 font-display text-xl font-semibold", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("m-0 text-muted-foreground", className)} {...props} />;
}

/** Scrollable body of a right drawer: 20px padding, 22px gaps between blocks. */
export function SheetBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-[22px] p-5", className)} {...props} />;
}

/** Bottom-sheet footer: [Clear] [Show N tools] in a 1fr 2fr grid. */
export function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid grid-cols-[1fr_2fr] gap-2", className)} {...props} />;
}
