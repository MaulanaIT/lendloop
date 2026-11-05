"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-[60] bg-overlay", className)}
      {...props}
    />
  );
}

const SIZE = {
  sm: "md:max-w-[400px]",
  md: "md:max-w-[420px]",
  lg: "md:max-w-[440px]",
  xl: "md:max-w-[460px]",
} as const;

export type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  /** Desktop max width: sm 400 · md 420 (confirm) · lg 440 (approve) · xl 460 (decline, remove). */
  size?: keyof typeof SIZE;
  /** Top-right X button (sign-in style dialogs). Confirm dialogs omit it: Cancel and Esc close them. */
  showClose?: boolean;
  /** role="alertdialog" for confirmations that interrupt (brief A8 ConfirmDialog). */
  alert?: boolean;
};

/**
 * Centered card on ≥768px, bottom sheet below (brief B16). Radix traps focus,
 * restores it on close and closes on Esc / overlay click.
 */
export function DialogContent({
  className,
  size = "md",
  showClose = false,
  alert = false,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        role={alert ? "alertdialog" : "dialog"}
        className={cn(
          "fixed z-[60] flex flex-col gap-3 overflow-y-auto border border-border bg-popover text-foreground shadow-ll-pop animate-ll-in",
          // Mobile: bottom sheet.
          "inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl p-6 pb-[calc(24px+env(safe-area-inset-bottom))]",
          // Desktop: centered card.
          "md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:max-h-[calc(100vh-32px)] md:w-[calc(100%-32px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:pb-6",
          SIZE[size],
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label="Close"
            title="Close"
            className="absolute top-2.5 right-2.5 grid size-11 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted md:size-9"
          >
            <X aria-hidden className="size-5" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

/** 20px Bricolage question title ("Cancel this request?"). */
export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("m-0 font-display text-xl font-semibold text-balance", className)}
      {...props}
    />
  );
}

/** Muted consequence text under the title. */
export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("m-0 text-muted-foreground text-pretty", className)} {...props} />
  );
}

/**
 * Right-aligned buttons on desktop; on mobile they stack full width with the
 * confirming action on top (column-reverse), matching the prototype sheets.
 */
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-2 flex flex-col-reverse gap-2 md:flex-row md:flex-wrap md:justify-end", className)}
      {...props}
    />
  );
}
