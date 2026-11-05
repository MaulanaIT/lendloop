"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavCountsDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, activeNavKey } from "./nav-items";

export type MobileTabBarProps = {
  counts: NavCountsDTO | null | undefined;
};

/**
 * <768px bottom tab bar (brief B16): Browse · Listings · Requests (red dot) ·
 * Incoming (badge). 60px tall targets; the active tab gets a teal pill and a
 * heavier icon. Admin lives in the avatar menu ("Admin console").
 * The layout pads <main> by 88px so content never hides behind it.
 */
export function MobileTabBar({ counts }: MobileTabBarProps) {
  const active = activeNavKey(usePathname());
  const incoming = counts?.incomingPending ?? 0;
  const overdue = (counts?.overdueBorrowing ?? 0) > 0;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map(({ key, short, href, icon: Icon }) => {
        const on = active === key;
        return (
          <Link
            key={key}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex min-h-[60px] flex-col items-center justify-center gap-[3px] text-xs font-medium no-underline",
              on ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "relative inline-flex rounded-full px-4 py-1",
                on ? "bg-primary-subtle text-primary" : "text-muted-foreground",
              )}
            >
              {/* A class, not the strokeWidth prop: the global svg.lucide rule outranks SVG attributes. */}
              <Icon aria-hidden className={cn("size-5", on && "[stroke-width:2.5]")} />
              {key === "requests" && overdue ? (
                <span
                  role="img"
                  aria-label="Something is overdue"
                  className="absolute top-0.5 right-3 size-2 rounded-full border-2 border-card bg-destructive"
                />
              ) : null}
              {key === "incoming" && incoming > 0 ? (
                <span
                  aria-label={`${incoming} pending requests`}
                  className="absolute -top-1.5 right-0 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card bg-primary px-[5px] text-[11px] font-semibold text-primary-foreground"
                >
                  {incoming}
                </span>
              ) : null}
            </span>
            {short}
          </Link>
        );
      })}
    </nav>
  );
}
