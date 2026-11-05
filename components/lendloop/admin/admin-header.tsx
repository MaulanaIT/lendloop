import { ArrowRight, TriangleExclamationPoint } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { CountBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { RoleBadge } from "../role-badge";

export const ADMIN_TABS = [
  { key: "loans", label: "Loans", href: "/admin/loans" },
  { key: "listings", label: "Listings", href: "/admin/listings" },
  { key: "users", label: "Users", href: "/admin/users" },
  { key: "automation", label: "Automation", href: "/admin/automation" },
] as const;

export type AdminTabKey = (typeof ADMIN_TABS)[number]["key"];

export function adminTabFromPath(pathname: string): AdminTabKey | null {
  return ADMIN_TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.key ?? null;
}

export type AdminHeaderProps = {
  active: AdminTabKey | null;
  /** Failures in the last 24h without a later successful retry (users.navCounts). */
  failures: number;
};

/** Shared admin header: H1 "Admin" + ink pill, section tabs, and the 24h failure banner. */
export function AdminHeader({ active, failures }: AdminHeaderProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-display text-[clamp(24px,4vw,30px)] font-semibold tracking-[-0.01em]">Admin</h1>
        <RoleBadge role="admin" size="md" />
      </div>
      <nav
        aria-label="Admin sections"
        className="mt-4 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ADMIN_TABS.map((t) => {
          const current = t.key === active;
          const badge = t.key === "automation" && failures > 0;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3.5 text-sm font-semibold whitespace-nowrap no-underline transition-colors duration-150",
                // Inset ring: the scrolling nav clips anything drawn outside the link.
                "focus-visible:rounded-sm focus-visible:outline-offset-[-2px]",
                current
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {badge ? (
                <>
                  <CountBadge
                    aria-hidden
                    tone="danger"
                    count={failures}
                    className="h-[18px] min-w-[18px] px-[5px] text-[11px]"
                  />
                  <span className="sr-only">{`, ${failures} automation ${plural(failures, "failure")}`}</span>
                </>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {failures > 0 ? (
        <Alert
          role="alert"
          tone="danger"
          icon={TriangleExclamationPoint}
          className="mt-5"
          title={
            <span className="tabular">{`${failures} automation ${plural(failures, "failure")} in the last 24h`}</span>
          }
          action={
            <Button asChild variant="destructive-outline" className="gap-1">
              <Link href="/admin/automation">
                Review
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        />
      ) : null}
    </>
  );
}
