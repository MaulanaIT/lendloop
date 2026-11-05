import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Teal rounded square with a two-arrow loop; one arrowhead is a roof. Colors
 * come from --primary / --primary-foreground, so dark mode gets the #2DD4BF
 * mark with an ink #042F2E loop (brief A7) automatically.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <g
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22.6 18.4A7 7 0 0 1 9.4 18.4" />
        <path d="M6.2 20.2 9.4 17l3.2 3.2" />
        <path d="M9.4 13.6A7 7 0 0 1 22.6 13.6" />
        <path d="M19.6 13.2l3 1.2 1.2-3" />
      </g>
    </svg>
  );
}

const WORDMARK_SIZE = { sm: "text-lg", md: "text-xl", lg: "text-[21px]" } as const;

/** Lowercase "lend" + teal "loop" in Bricolage 700. sm 18px (footer) · md 20px (mobile bar) · lg 21px (desktop). */
export function Wordmark({ size = "lg", className }: { size?: keyof typeof WORDMARK_SIZE; className?: string }) {
  return (
    <span
      className={cn(
        "font-display font-bold tracking-[-0.02em] text-foreground",
        WORDMARK_SIZE[size],
        className,
      )}
    >
      lend<span className="text-primary">loop</span>
    </span>
  );
}

export type LogoProps = {
  /** Link target; omit to render a plain lockup. */
  href?: string;
  /** Accessible name of the link, e.g. "LendLoop home" or "LendLoop, go to Browse". */
  label?: string;
  size?: "md" | "lg";
  className?: string;
};

/** Mark + wordmark lockup used in the headers. */
export function Logo({ href, label = "LendLoop home", size = "lg", className }: LogoProps) {
  const content = (
    <>
      <LogoMark />
      <Wordmark size={size} />
    </>
  );
  const classes = cn(
    "flex items-center no-underline text-foreground hover:text-foreground",
    size === "lg" ? "gap-2.5" : "gap-2",
    className,
  );
  if (!href) return <span className={classes}>{content}</span>;
  return (
    <Link href={href} aria-label={label} className={cn(classes, "rounded-md")}>
      {content}
    </Link>
  );
}
