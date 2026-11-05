import type { PersonDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";
import { TrustedLenderBadge } from "./trusted-badge";

const AVATAR = {
  /** 16px: person chip inside the activity timeline. */
  xs: "size-4 text-[8px]",
  /** 28px: tool card owner row. */
  sm: "size-7 text-[11px]",
  /** 36px: admin user rows, incoming rows. */
  md: "size-9 text-[13px]",
  /** 40px: avatar menu header, loan People card. */
  lg: "size-10 text-sm",
} as const;

export type PersonAvatarProps = {
  initials: string;
  size?: keyof typeof AVATAR;
  /** muted (other people) · primary (the viewer's own avatar in the nav). */
  tone?: "muted" | "primary";
  /** Adds a 1px border (People card). */
  bordered?: boolean;
  className?: string;
};

/** Initials circle. Decorative: the name is always written next to it. */
export function PersonAvatar({ initials, size = "sm", tone = "muted", bordered = false, className }: PersonAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        AVATAR[size],
        tone === "primary" ? "border border-accent bg-primary-subtle text-primary-hover" : "bg-muted text-foreground",
        bordered && tone === "muted" && "border border-border",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export type PersonNameProps = {
  person: Pick<PersonDTO, "name" | "trusted">;
  /** Replace the name with "You" (tool card owner row on your own tool). */
  isYou?: boolean;
  /** Append a muted "(you)". */
  markYou?: boolean;
  /** Show the icon-only Trusted badge when trusted (default true). */
  showTrusted?: boolean;
  className?: string;
};

/** "Rina S." + optional sm Trusted Lender badge. */
export function PersonName({ person, isYou = false, markYou = false, showTrusted = true, className }: PersonNameProps) {
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      <span className="font-medium">{isYou ? "You" : person.name}</span>
      {markYou ? <span className="text-muted-foreground">(you)</span> : null}
      {showTrusted && person.trusted ? <TrustedLenderBadge size="sm" /> : null}
    </span>
  );
}
