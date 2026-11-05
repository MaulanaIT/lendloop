import { ShieldHalf } from "lucide-react";
import type { Role } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";

export type RoleBadgeProps = {
  role: Role;
  /** Text for non-admins: "Member" in the avatar menu, "User" in admin tables (default). */
  userLabel?: string;
  /** sm 22px (menus, tables) · md 24px (desktop nav pill). */
  size?: "sm" | "md";
  className?: string;
};

/** Admin = ink-inverted pill with ShieldHalf (inverts again in dark mode); user = outline pill. */
export function RoleBadge({ role, userLabel = "User", size = "sm", className }: RoleBadgeProps) {
  const h = size === "md" ? "h-6 px-[9px]" : "h-[22px] px-2";
  if (role === "admin") {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full bg-admin-bg text-xs font-semibold whitespace-nowrap text-admin",
          h,
          className,
        )}
      >
        <ShieldHalf aria-hidden className="size-3.5" />
        Admin
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-border text-xs font-medium whitespace-nowrap text-muted-foreground",
        h,
        className,
      )}
    >
      {userLabel}
    </span>
  );
}
