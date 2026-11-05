"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import { useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent",
    "font-semibold transition-colors duration-150 ease-out cursor-pointer select-none no-underline",
    "disabled:cursor-not-allowed disabled:opacity-55",
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
    "[&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground aria-disabled:hover:bg-primary",
        // Muted fill: "I've returned it", "Cancel" on approved loans.
        secondary: "bg-muted text-foreground hover:bg-border hover:text-foreground aria-disabled:hover:bg-muted",
        outline:
          "border-border bg-card text-foreground hover:bg-muted hover:text-foreground aria-disabled:hover:bg-card",
        ghost: "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground aria-disabled:hover:bg-destructive",
        "destructive-outline":
          "border-danger-border bg-card text-danger hover:bg-danger-bg hover:text-danger aria-disabled:hover:bg-card",
        link: "h-auto border-0 bg-transparent px-0 text-primary underline-offset-[3px] hover:text-primary-hover hover:underline",
      },
      // Mobile first: every size keeps a 44px touch target below md (brief B16/B17).
      size: {
        sm: "h-11 gap-1.5 px-3 text-[13px] md:h-9 [&_svg]:size-3.5",
        md: "h-11 px-3.5 text-sm md:h-10 [&_svg]:size-4",
        lg: "h-11 px-5 text-[15px] [&_svg]:size-5",
        icon: "size-11 p-0 md:size-10 [&_svg]:size-5",
        "icon-sm": "size-11 p-0 md:size-8 [&_svg]:size-4",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0 md:h-auto" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. next/link) with button styles. */
    asChild?: boolean;
    /** Shows a spinner, keeps the label, blocks clicks. */
    loading?: boolean;
    /** Label while loading, e.g. "Saving…". Defaults to the children. */
    loadingLabel?: ReactNode;
    /**
     * Blocked-right-now actions (brief B1): the button stays focusable with
     * aria-disabled and explains why in a tooltip, on hover, focus or tap.
     */
    disabledReason?: string | null;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  loadingLabel,
  disabledReason,
  disabled,
  onClick,
  children,
  type,
  ...props
}: ButtonProps) {
  const [tipOpen, setTipOpen] = useState(false);
  const blocked = Boolean(disabledReason);
  const Comp = asChild ? Slot.Root : "button";

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (blocked) {
      e.preventDefault();
      setTipOpen(true); // touch devices have no hover; show the reason on tap
      return;
    }
    if (loading) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  const button = (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), loading && "cursor-progress", className)}
      disabled={disabled}
      aria-disabled={blocked || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...props}
    >
      {asChild ? (
        children
      ) : loading ? (
        <>
          <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
          {loadingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Comp>
  );

  if (!blocked) return button;
  return (
    <Tooltip content={disabledReason} open={tipOpen} onOpenChange={setTipOpen}>
      {button}
    </Tooltip>
  );
}
