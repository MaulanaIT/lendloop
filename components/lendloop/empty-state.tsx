import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const RING = {
  sm: { outer: "size-20", inner: "size-[52px]", icon: "size-[22px]" },
  md: { outer: "size-[88px]", inner: "size-14", icon: "size-6" },
  lg: { outer: "size-24", inner: "size-[60px]", icon: "size-6" },
} as const;

export type LoopRingProps = {
  icon: LucideIcon;
  /** sm 80px (state previews) · md 88px (empty states) · lg 96px (404/403 pages). */
  size?: keyof typeof RING;
  /** danger: red ring for error.tsx. */
  tone?: "primary" | "danger";
  className?: string;
};

/** The brand motif: icon inside a dashed "loop ring" (brief A7). Decorative. */
export function LoopRing({ icon: Icon, size = "md", tone = "primary", className }: LoopRingProps) {
  const s = RING[size];
  const danger = tone === "danger";
  return (
    <div
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-[1.5px] border-dashed",
        danger ? "border-danger-border" : "border-primary",
        s.outer,
        className,
      )}
    >
      <div
        className={cn(
          "grid place-items-center rounded-full",
          danger ? "bg-danger-bg text-danger" : "bg-primary-subtle text-primary",
          s.inner,
        )}
      >
        <Icon className={s.icon} />
      </div>
    </div>
  );
}

export type EmptyStateProps = {
  icon: LucideIcon;
  /** "No requests waiting." */
  title: ReactNode;
  /** One sentence: "You're all caught up." */
  description?: ReactNode;
  /** A single CTA, e.g. <Button asChild><Link href="/tools">Browse tools</Link></Button>. */
  action?: ReactNode;
  headingLevel?: "h2" | "h3";
  /** Drop the card frame (when already inside a card or panel). */
  bare?: boolean;
  className?: string;
};

/** Empty state: loop ring + title + one sentence + one CTA (brief A8). */
export function EmptyState({
  icon,
  title,
  description,
  action,
  headingLevel: H = "h2",
  bare = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 text-center",
        !bare && "rounded-lg border border-border bg-card px-6 py-14",
        className,
      )}
    >
      <LoopRing icon={icon} />
      <H className="m-0 mt-1 max-w-[420px] font-display text-xl font-semibold text-balance">{title}</H>
      {description ? <p className="m-0 max-w-[400px] text-muted-foreground text-pretty">{description}</p> : null}
      {action ? <div className="mt-1 flex justify-center">{action}</div> : null}
    </div>
  );
}
