import { ClipboardList, Inbox, Package, Search, type LucideIcon } from "lucide-react";

export type NavKey = "browse" | "listings" | "requests" | "incoming" | "admin";

export type NavItem = {
  key: Exclude<NavKey, "admin">;
  /** Desktop label. */
  label: string;
  /** Mobile tab label. */
  short: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "browse", label: "Browse", short: "Browse", href: "/tools", icon: Search },
  { key: "listings", label: "My listings", short: "Listings", href: "/me/listings", icon: Package },
  { key: "requests", label: "My requests", short: "Requests", href: "/me/requests", icon: ClipboardList },
  { key: "incoming", label: "Incoming", short: "Incoming", href: "/me/incoming", icon: Inbox },
];

export const ADMIN_HREF = "/admin/loans";

/**
 * Which nav item a path belongs to. Tool detail counts as Browse; the tool
 * form (new / edit) as My listings; loan detail highlights nothing.
 */
export function activeNavKey(pathname: string): NavKey | null {
  if (pathname === "/tools/new" || /^\/tools\/[^/]+\/edit\/?$/.test(pathname)) return "listings";
  if (pathname === "/tools" || pathname.startsWith("/tools/")) return "browse";
  if (pathname.startsWith("/me/listings")) return "listings";
  if (pathname.startsWith("/me/requests")) return "requests";
  if (pathname.startsWith("/me/incoming")) return "incoming";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  return null;
}
