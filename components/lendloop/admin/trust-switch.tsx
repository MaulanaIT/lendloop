"use client";

import { useRef, useState, type ReactNode } from "react";
import { MsDay } from "@/components/lendloop/relative-time";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverClose, PopoverContent } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import type { AdminUserDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";

export const OWN_BADGE_REASON = "You can't change your own badge.";

/** "Granted by Ayu W. on Oct 12" / "Not granted". */
export function trustedSubline(
  u: Pick<AdminUserDTO, "trusted" | "trustedGrantedByName" | "trustedGrantedAt">,
): ReactNode {
  if (!u.trusted) return "Not granted";
  const on = u.trustedGrantedAt ? (
    <>
      {" "}
      on <MsDay ms={u.trustedGrantedAt} />
    </>
  ) : null;
  return u.trustedGrantedByName ? (
    <>
      Granted by {u.trustedGrantedByName}
      {on}
    </>
  ) : (
    <>Granted{on}</>
  );
}

export type TrustSwitchProps = {
  user: Pick<AdminUserDTO, "name" | "trusted" | "isSelf">;
  /** A setTrusted call for this user is in flight. */
  busy?: boolean;
  /** Blocked right now for another reason (offline). */
  disabledReason?: string | null;
  /** Called after the admin confirms in the popover. */
  onConfirm: (next: boolean) => void;
  /** row: 52×36 hit area in the table · card: 44px target and full-width popover buttons. */
  variant?: "row" | "card";
};

function Track({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none",
        on ? "bg-primary" : "bg-control-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-4 rounded-full bg-card shadow-ll-card transition-transform duration-150 motion-reduce:transition-none",
          on && "translate-x-4",
        )}
      />
    </span>
  );
}

/**
 * Trusted Lender switch for Admin · Users. Toggling never writes directly: a
 * small confirm popover asks first. Your own row is focusable but blocked,
 * with the reason in a tooltip. Convex rejects self-changes regardless.
 */
export function TrustSwitch({ user, busy = false, disabledReason, onConfirm, variant = "row" }: TrustSwitchProps) {
  const [open, setOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const switchRef = useRef<HTMLButtonElement>(null);
  const on = user.trusted;
  const blocked = user.isSelf ? OWN_BADGE_REASON : busy ? "Saving…" : (disabledReason ?? null);
  const label = `Trusted Lender for ${user.name}`;

  const switchClasses = cn(
    "grid shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0",
    variant === "card" ? "-m-2 h-11 w-[52px]" : "-mx-2 -my-1.5 h-11 w-[52px] md:h-9",
    blocked && "cursor-not-allowed",
    (user.isSelf || busy) && "opacity-55",
  );

  if (blocked) {
    return (
      <Tooltip content={blocked} open={tipOpen} onOpenChange={setTipOpen}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-disabled
          aria-label={label}
          className={switchClasses}
          onClick={() => setTipOpen(true)}
        >
          <Track on={on} />
        </button>
      </Tooltip>
    );
  }

  const question = on
    ? `Remove the Trusted Lender badge from ${user.name}?`
    : `Mark ${user.name} as Trusted Lender? The badge appears on all their listings.`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* An anchor, not a Trigger: a Trigger would add aria-haspopup/expanded, which role="switch" doesn't support. */}
      <PopoverAnchor asChild>
        <button
          ref={switchRef}
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          title={label}
          className={switchClasses}
          onClick={() => setOpen((o) => !o)}
        >
          <Track on={on} />
        </button>
      </PopoverAnchor>
      <PopoverContent
        role="dialog"
        aria-label="Confirm Trusted Lender change"
        // Let the switch's own click toggle the popover closed instead of dismiss-then-reopen.
        onInteractOutside={(e) => {
          if (switchRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          switchRef.current?.focus();
        }}
        align={variant === "card" ? "start" : "end"}
        className="flex w-[min(300px,calc(100vw-32px))] flex-col gap-3 p-3.5"
      >
        <p className="m-0 font-medium text-pretty">{question}</p>
        <div className={cn(variant === "card" ? "grid grid-cols-2 gap-2" : "flex justify-end gap-2")}>
          <PopoverClose asChild>
            <Button variant="outline" size="sm" className={variant === "card" ? "h-11" : undefined}>
              Cancel
            </Button>
          </PopoverClose>
          <Button
            size="sm"
            className={variant === "card" ? "h-11" : undefined}
            onClick={() => {
              setOpen(false);
              onConfirm(!on);
            }}
          >
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
