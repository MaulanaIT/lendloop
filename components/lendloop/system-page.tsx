import { SearchX, ShieldX, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoopRing } from "./empty-state";

export type SystemStateProps = {
  icon: LucideIcon;
  /** Small mono code above the title ("404", "403"). */
  code?: string;
  title: ReactNode;
  body?: ReactNode;
  /** The single recovery action: a link, or any node (e.g. a <Button onClick>). */
  action?: { label: string; href: string } | ReactNode;
  tone?: "primary" | "danger";
  className?: string;
};

function isLinkAction(a: SystemStateProps["action"]): a is { label: string; href: string } {
  return typeof a === "object" && a !== null && "href" in a && "label" in a;
}

/** Centered full-page state with the loop-ring motif. Renders the page's only <h1>. */
export function SystemState({ icon, code, title, body, action, tone = "primary", className }: SystemStateProps) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-6xl flex-col items-center gap-3.5 px-4 py-[clamp(48px,10vw,112px)] text-center sm:px-6 lg:px-8",
        className,
      )}
    >
      <LoopRing icon={icon} size="lg" tone={tone} />
      {code ? <p className="m-0 mt-1.5 font-mono text-[13px] text-muted-foreground">{code}</p> : null}
      <h1 className="m-0 font-display text-[30px] font-semibold tracking-[-0.01em] text-balance">{title}</h1>
      {body ? <p className="m-0 max-w-[440px] text-base text-muted-foreground text-pretty">{body}</p> : null}
      {action ? (
        <div className="mt-2">
          {isLinkAction(action) ? (
            <Button asChild variant="outline" className="px-4">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            action
          )}
        </div>
      ) : null}
    </div>
  );
}

export type ForbiddenPageProps = {
  /**
   * Role: title "Admins only." + body "You're signed in as a regular user." + [Back to the board → /tools].
   * Ownership: title "You can only edit your own listings." + [Back to tool → /tools/[id]].
   * Never uses the word "error".
   */
  title: string;
  body?: string;
  action: { label: string; href: string };
};

/** 403 page (ShieldX). Rendered for FORBIDDEN on routes; actions get a 403 toast instead. */
export function ForbiddenPage({ title, body, action }: ForbiddenPageProps) {
  return <SystemState icon={ShieldX} code="403" title={title} body={body} action={action} />;
}

/** Presets matching brief A9. */
export const FORBIDDEN_COPY = {
  admin: { title: "Admins only.", body: "You're signed in as a regular user.", action: { label: "Back to the board", href: "/tools" } },
  editListing: (toolId: string) => ({
    title: "You can only edit your own listings.",
    action: { label: "Back to tool", href: `/tools/${toolId}` },
  }),
} as const;

export type NotFoundStateProps = {
  /** Defaults to [Browse tools → /tools]; visitors get [Go to home → /]. */
  action?: { label: string; href: string };
};

/**
 * 404 (SearchX): "We couldn't find that." Used for NOT_FOUND, including loans
 * the viewer isn't party to, so IDs don't leak.
 */
export function NotFoundState({ action = { label: "Browse tools", href: "/tools" } }: NotFoundStateProps) {
  return (
    <SystemState
      icon={SearchX}
      code="404"
      title="We couldn't find that."
      body="It may have been removed, or the link is wrong."
      action={action}
    />
  );
}
