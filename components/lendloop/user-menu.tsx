"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut, Monitor, Moon, Package, ShieldHalf, Sun, SunMoon, UserCog, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import { CountBadge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import type { ViewerDTO } from "@/lib/domain/dto";
import { useTheme, type ThemePreference } from "@/lib/hooks/use-theme";
import { cn } from "@/lib/utils";
import { ADMIN_HREF } from "./nav-items";
import { PersonAvatar } from "./person";
import { RoleBadge } from "./role-badge";
import { TrustedLenderBadge } from "./trusted-badge";

const THEMES: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export type UserMenuProps = {
  /** Null while users.me is loading: renders a placeholder avatar. */
  viewer: ViewerDTO | null;
  /**
   * desktop: 36px avatar trigger, "My listings" item.
   * mobile: 44px trigger, "Admin console" item for admins (the tab bar has no Admin tab).
   */
  variant: "desktop" | "mobile";
  /** Admin console badge (failed automations, 24h). */
  adminFailures?: number | null;
};

/**
 * Avatar menu: name, email, role + Trusted badges, links, Light/Dark/System,
 * Clerk "Manage account" and "Sign out". The role badge reflects the Convex
 * users row; it only decides what to show, never what is allowed.
 */
export function UserMenu({ viewer, variant, adminFailures }: UserMenuProps) {
  const { openUserProfile, signOut } = useClerk();
  const { theme, setTheme } = useTheme();
  const mobile = variant === "mobile";

  if (!viewer) {
    return (
      <span className={cn("grid place-items-center", mobile ? "size-11" : "size-9")}>
        <Skeleton className={cn("rounded-full", mobile ? "size-[34px]" : "size-9")} />
      </span>
    );
  }

  const label = `Account menu for ${viewer.name}`;
  const isAdmin = viewer.role === "admin";
  const failures = adminFailures ?? 0;

  return (
    <DropdownMenu>
      <Tooltip content={label}>
        <DropdownMenuTrigger
          aria-label={label}
          className={cn(
            "grid shrink-0 cursor-pointer place-items-center rounded-full",
            mobile ? "size-11 rounded-md bg-transparent p-0" : "size-9",
          )}
        >
          <PersonAvatar initials={viewer.initials} tone="primary" size="md" className={mobile ? "size-[34px]" : undefined} />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent sideOffset={mobile ? 6 : 8} className="w-[272px]">
        <div className="mb-1.5 flex items-start gap-3 border-b border-border p-3">
          {!mobile ? <PersonAvatar initials={viewer.initials} tone="primary" size="lg" className="border-0" /> : null}
          <div className="flex min-w-0 flex-col gap-1.5">
            <div>
              <p className="m-0 font-semibold">{viewer.name}</p>
              <p className="m-0 text-[13px] [overflow-wrap:anywhere] text-muted-foreground">{viewer.email}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <RoleBadge role={viewer.role} userLabel="Member" />
              {viewer.trusted ? <TrustedLenderBadge size="md" withTooltip={false} /> : null}
            </div>
          </div>
        </div>

        {!mobile ? (
          <DropdownMenuItem asChild className="px-3 md:min-h-10">
            <Link href="/me/listings" className="no-underline">
              <Package aria-hidden />
              My listings
            </Link>
          </DropdownMenuItem>
        ) : null}
        {mobile && isAdmin ? (
          <DropdownMenuItem asChild className="px-3">
            <Link href={ADMIN_HREF} className="no-underline">
              <ShieldHalf aria-hidden />
              <span className="flex-1">Admin console</span>
              {failures > 0 ? (
                <CountBadge count={failures} tone="danger" aria-label={`${failures} failed automations`} />
              ) : null}
            </Link>
          </DropdownMenuItem>
        ) : null}

        <div
          className={cn(
            "flex items-center justify-between gap-2 pl-3",
            mobile ? "min-h-[52px] pr-1" : "min-h-10 pr-1.5",
          )}
        >
          <span className="flex items-center gap-2.5">
            <SunMoon aria-hidden className="size-4" />
            Theme
          </span>
          <DropdownMenuRadioGroup
            aria-label="Theme"
            value={theme}
            onValueChange={(v) => setTheme(v as ThemePreference)}
            className="inline-flex rounded-md bg-muted p-0.5"
          >
            {THEMES.map(({ value, label: themeLabel, icon: Icon }) => (
              <MenuPrimitive.RadioItem
                key={value}
                value={value}
                aria-label={themeLabel}
                title={themeLabel}
                // Keep the menu open so the change is visible.
                onSelect={(e) => e.preventDefault()}
                className={cn(
                  "grid cursor-pointer place-items-center rounded-sm border border-transparent text-muted-foreground outline-none",
                  "data-[highlighted]:ring-2 data-[highlighted]:ring-ring data-[state=checked]:border-border data-[state=checked]:bg-card data-[state=checked]:text-foreground",
                  mobile ? "size-11" : "h-7 w-8",
                )}
              >
                <Icon aria-hidden className={mobile ? "size-4" : "size-3.5"} />
              </MenuPrimitive.RadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </div>

        <DropdownMenuItem className="px-3 md:min-h-10" onSelect={() => openUserProfile()}>
          <UserCog aria-hidden />
          Manage account
        </DropdownMenuItem>
        <DropdownMenuItem className="px-3 md:min-h-10" onSelect={() => void signOut({ redirectUrl: "/" })}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
