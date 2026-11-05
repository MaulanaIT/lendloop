"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CountBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { OFFLINE_ACTION_REASON } from "@/lib/copy";
import type { NavCountsDTO, ViewerDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";
import { useOffline } from "./banners";
import { Logo } from "./logo";
import { ADMIN_HREF, NAV_ITEMS, activeNavKey, type NavKey } from "./nav-items";
import { RoleBadge } from "./role-badge";
import { UserMenu } from "./user-menu";

export type AppNavProps = {
  viewer: ViewerDTO | null;
  /** users.navCounts; undefined/null while loading (no badges shown). */
  counts: NavCountsDTO | null | undefined;
};

/** Red dot meaning "you have something overdue" (never color-only: it has an accessible name). */
export function OverdueDot({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Something is overdue"
      className={cn("size-2 shrink-0 rounded-full bg-destructive", className)}
    />
  );
}

/**
 * Signed-in header. ≥768px: logo · Browse · My listings · My requests (red dot)
 * · Incoming (count) · Admin (admins, red failure count) + "List a tool" +
 * avatar menu, active item underlined. <768px: compact top bar (logo, "+",
 * avatar); navigation lives in <MobileTabBar/>.
 *
 * The Admin item is shown from the Convex role only for convenience; the
 * admin pages and every admin function re-check the role on the server.
 */
export function AppNav({ viewer, counts }: AppNavProps) {
  const pathname = usePathname();
  const active = activeNavKey(pathname);
  const offline = useOffline();
  const isAdmin = viewer?.role === "admin";
  const incoming = counts?.incomingPending ?? 0;
  const overdue = (counts?.overdueBorrowing ?? 0) > 0;
  const failures = counts?.adminFailures24h ?? 0;
  const newDisabled = offline ? OFFLINE_ACTION_REASON : null;

  return (
    <>
      {/* Desktop */}
      <header className="sticky top-0 z-30 hidden border-b border-border bg-card md:block">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-7 px-4 sm:px-6 lg:px-8">
          <Logo href="/tools" label="LendLoop, go to Browse" />
          <nav aria-label="Main" className="flex h-16 items-stretch gap-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.key} href={item.href} current={active === item.key}>
                <span>{item.label}</span>
                {item.key === "requests" && overdue ? <OverdueDot /> : null}
                {item.key === "incoming" && incoming > 0 ? (
                  <CountBadge count={incoming} aria-label={`${incoming} pending requests`} />
                ) : null}
              </NavLink>
            ))}
            {isAdmin ? (
              <NavLink href={ADMIN_HREF} current={active === "admin"}>
                <span>Admin</span>
                {failures > 0 ? (
                  <CountBadge
                    count={failures}
                    tone="danger"
                    aria-label={`${failures} failed automations in the last 24 hours`}
                  />
                ) : null}
              </NavLink>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {/* Admins get an icon-only button below 1100px, so it needs a visible name.
                When disabled, Button shows its own reason tooltip instead. */}
            <Tooltip content={isAdmin && !newDisabled ? "List a tool" : null}>
              <Button
                asChild
                disabledReason={newDisabled}
                aria-label="List a tool"
                className={cn("pr-3.5 pl-3", isAdmin && "w-10 px-0 min-[1100px]:w-auto min-[1100px]:pr-3.5 min-[1100px]:pl-3")}
              >
                <Link href="/tools/new">
                  <Plus aria-hidden className="size-5" />
                  <span className={cn(isAdmin && "hidden min-[1100px]:inline")}>List a tool</span>
                </Link>
              </Button>
            </Tooltip>
            {isAdmin ? <RoleBadge role="admin" size="md" className="hidden min-[1100px]:inline-flex" /> : null}
            <UserMenu viewer={viewer} variant="desktop" adminFailures={counts?.adminFailures24h} />
          </div>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card md:hidden">
        <div className="flex h-14 items-center gap-1 pr-3 pl-4">
          <Logo href="/tools" label="LendLoop, go to Browse" size="md" className="mr-auto" />
          <Tooltip content={newDisabled ?? "List a tool"}>
            <Link
              href="/tools/new"
              aria-label="List a tool"
              aria-disabled={newDisabled ? true : undefined}
              onClick={(e) => newDisabled && e.preventDefault()}
              className={cn(
                "grid size-11 place-items-center rounded-md text-primary hover:bg-muted hover:text-primary",
                newDisabled && "cursor-not-allowed opacity-55",
              )}
            >
              <Plus aria-hidden className="size-5" />
            </Link>
          </Tooltip>
          <UserMenu viewer={viewer} variant="mobile" adminFailures={counts?.adminFailures24h} />
        </div>
      </header>
    </>
  );
}

function NavLink({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 border-y-2 border-transparent px-3 text-sm font-medium whitespace-nowrap no-underline transition-colors duration-150",
        current
          ? "border-b-primary text-foreground hover:text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export type { NavKey };
