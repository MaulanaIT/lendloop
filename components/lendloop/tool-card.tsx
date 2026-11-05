"use client";

import { Ellipsis, Gauge, Pencil, ShieldHalf, Trash } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { CONDITION_META } from "@/lib/domain/categories";
import type { ISODate } from "@/lib/domain/dates";
import type { PublicToolDTO, ToolCardDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";
import { AvailabilityPill } from "./availability-pill";
import { CategoryChip } from "./category-chip";
import { CategoryTile } from "./category-icon";
import { PersonAvatar } from "./person";
import { TrustedLenderBadge } from "./trusted-badge";

type Heading = "h2" | "h3";

export type PublicToolCardProps = {
  variant: "public";
  /** Exactly {_id, name, category}: nothing else is sent to visitors. */
  tool: PublicToolDTO;
  headingLevel?: Heading;
  className?: string;
};

export type MemberToolCardProps = {
  variant: "member";
  tool: ToolCardDTO;
  /** App today (clientToday()) for "On loan · back today". */
  today?: ISODate;
  /** Defaults to tool.isOwner. Shows the "Your tool" tag, "You" in the owner row and Edit/Delete. */
  isOwner?: boolean;
  /** Viewer is an admin: adds a red "Remove listing" to the ⋯ menu on other people's tools. */
  isAdmin?: boolean;
  /** Owner only: why Delete is blocked ("Can't delete while lent out. Mark it returned first."). */
  deleteBlockedReason?: string | null;
  /** Defaults to a link to /tools/[id]/edit. */
  onEdit?: () => void;
  /** Open your delete ConfirmDialog. Not called while deleteBlockedReason is set. */
  onDelete?: () => void;
  /** Open RemoveListingDialog. */
  onRemove?: () => void;
  headingLevel?: Heading;
  className?: string;
};

export type ToolCardProps = PublicToolCardProps | MemberToolCardProps;

/**
 * Tool card (brief A8). "public": tile + name + category chip, not clickable.
 * "member": the whole card links to /tools/[id] (stretched link on the name),
 * hover lifts 1px; the ⋯ menu and Trusted badge sit above the link so they
 * never trigger it. Wrap cards in <li> inside a <ul> grid.
 */
export function ToolCard(props: ToolCardProps) {
  return props.variant === "public" ? <PublicCard {...props} /> : <MemberCard {...props} />;
}

function PublicCard({ tool, headingLevel: H = "h3", className }: PublicToolCardProps) {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-ll-card md:p-5",
        className,
      )}
    >
      <CategoryTile category={tool.category} />
      <H className="m-0 font-display text-lg leading-[1.25] font-semibold [overflow-wrap:anywhere]">{tool.name}</H>
      <CategoryChip category={tool.category} />
    </div>
  );
}

function MemberCard({
  tool,
  today,
  isOwner = tool.isOwner,
  isAdmin = false,
  deleteBlockedReason,
  onEdit,
  onDelete,
  onRemove,
  headingLevel: H = "h2",
  className,
}: MemberToolCardProps) {
  const canRemove = isAdmin && !isOwner;
  const hasMenu = isOwner || canRemove;

  return (
    <div
      className={cn(
        "relative flex h-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-ll-card",
        "transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:shadow-ll-pop motion-reduce:hover:translate-y-0",
        "has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-ring",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <CategoryTile category={tool.category} labelled />
        <AvailabilityPill availability={tool.availability} today={today} />
      </div>

      <div className="mt-0.5 flex items-start gap-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <H className="m-0 text-base leading-[1.3] font-semibold">
            <Link
              href={`/tools/${tool._id}`}
              data-card-link
              className="text-foreground no-underline outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] hover:text-foreground"
            >
              {tool.name}
            </Link>
          </H>
          {isOwner ? (
            <Badge tone="outline" className="border-border">
              Your tool
            </Badge>
          ) : null}
        </div>
        {hasMenu ? (
          <CardMenu
            toolId={tool._id}
            toolName={tool.name}
            isOwner={isOwner}
            canRemove={canRemove}
            deleteBlockedReason={deleteBlockedReason ?? null}
            onEdit={onEdit}
            onDelete={onDelete}
            onRemove={onRemove}
          />
        ) : null}
      </div>

      <p className="m-0 flex items-center gap-1.5 text-muted-foreground">
        <Gauge aria-hidden className="size-4 shrink-0" />
        <span>
          <span className="sr-only">Condition: </span>
          {CONDITION_META[tool.condition].label}
        </span>
      </p>
      <p className="m-0 line-clamp-2 leading-normal text-muted-foreground">{tool.description}</p>

      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3.5 text-[13px]">
        <PersonAvatar initials={tool.owner.initials} size="sm" />
        <span className="font-medium">{isOwner ? "You" : tool.owner.name}</span>
        {tool.owner.trusted ? <TrustedLenderBadge size="sm" className="relative z-10" /> : null}
      </div>
    </div>
  );
}

function CardMenu({
  toolId,
  toolName,
  isOwner,
  canRemove,
  deleteBlockedReason,
  onEdit,
  onDelete,
  onRemove,
}: {
  toolId: string;
  toolName: string;
  isOwner: boolean;
  canRemove: boolean;
  deleteBlockedReason: string | null;
  onEdit?: () => void;
  onDelete?: () => void;
  onRemove?: () => void;
}) {
  const helpId = useId();
  const label = `Actions for ${toolName}`;
  return (
    <DropdownMenu modal={false}>
      <Tooltip content={label}>
        <DropdownMenuTrigger
          aria-label={label}
          className={cn(
            "relative z-10 -mt-2 -mr-2.5 grid size-11 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground md:size-8",
            "transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted",
          )}
        >
          <Ellipsis aria-hidden className="size-5" />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent>
        {isOwner ? (
          <>
            {onEdit ? (
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil aria-hidden />
                Edit
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem asChild>
                <Link href={`/tools/${toolId}/edit`} className="no-underline">
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              aria-disabled={deleteBlockedReason ? true : undefined}
              aria-describedby={deleteBlockedReason ? helpId : undefined}
              className={cn(deleteBlockedReason && "cursor-not-allowed opacity-55")}
              onSelect={(e) => {
                // Stay focusable so the reason is read out, but don't act.
                if (deleteBlockedReason) {
                  e.preventDefault();
                  return;
                }
                onDelete?.();
              }}
            >
              <Trash aria-hidden />
              Delete
            </DropdownMenuItem>
            {deleteBlockedReason ? (
              <p id={helpId} className="m-0 mr-2.5 mb-1.5 ml-9 text-xs leading-[1.4] text-muted-foreground">
                {deleteBlockedReason}
              </p>
            ) : null}
          </>
        ) : null}
        {isOwner && canRemove ? <DropdownMenuSeparator /> : null}
        {canRemove ? (
          <DropdownMenuItem variant="destructive" onSelect={() => onRemove?.()}>
            <ShieldHalf aria-hidden />
            Remove listing
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Loading placeholder matching the member card (Browse grid). */
export function ToolCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3.5 rounded-lg border border-border bg-card p-5", className)}>
      <div className="flex justify-between">
        <Skeleton className="size-12 rounded-tile" />
        <Skeleton className="h-6 w-[84px] rounded-full" />
      </div>
      <Skeleton className="h-4 w-[70%]" />
      <Skeleton className="h-3 w-[28%]" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="flex items-center gap-2 border-t border-border pt-3.5">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="h-3 w-[30%]" />
      </div>
    </div>
  );
}

/** Loading placeholder matching the public landing card. */
export function PublicToolCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:p-5", className)}>
      <Skeleton className="size-12 rounded-tile" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-6 w-24 rounded-full" />
    </div>
  );
}
