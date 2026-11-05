import { Gauge, Shapes } from "lucide-react";
import { AvailabilityPill } from "@/components/lendloop/availability-pill";
import { CategoryTile } from "@/components/lendloop/category-icon";
import { PersonAvatar } from "@/components/lendloop/person";
import { Badge } from "@/components/ui/badge";
import type { Availability } from "@/lib/domain/availability";
import { CONDITION_META, type Category, type Condition } from "@/lib/domain/categories";
import { cn } from "@/lib/utils";

export type ToolCardPreviewProps = {
  name: string;
  category: Category | null;
  condition: Condition | null;
  description: string;
  availability: Availability;
  viewerInitials: string;
  className?: string;
};

/**
 * Live, non-interactive copy of the Browse member card for the tool form,
 * with placeholders until each field is filled in.
 */
export function ToolCardPreview({
  name,
  category,
  condition,
  description,
  availability,
  viewerInitials,
  className,
}: ToolCardPreviewProps) {
  const n = name.trim();
  const d = description.trim();
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-ll-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {category ? (
          <CategoryTile category={category} />
        ) : (
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-tile bg-muted text-muted-foreground">
            <Shapes className="size-6" />
          </span>
        )}
        <AvailabilityPill availability={availability} />
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <h3
          className={cn(
            "m-0 text-base leading-[1.3] font-semibold [overflow-wrap:anywhere]",
            n ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {n || "Tool name"}
        </h3>
        <Badge tone="outline" className="border-border text-muted-foreground">
          Your tool
        </Badge>
      </div>
      <p className="m-0 flex items-center gap-1.5 text-muted-foreground">
        <Gauge aria-hidden className="size-4 shrink-0" />
        {condition ? CONDITION_META[condition].label : "Condition"}
      </p>
      <p className="m-0 line-clamp-2 leading-normal text-muted-foreground [overflow-wrap:anywhere]">
        {d || "Your description appears here."}
      </p>
      <div className="mt-1 flex items-center gap-2 border-t border-border pt-3.5 text-[13px]">
        <PersonAvatar initials={viewerInitials} size="sm" />
        <span className="font-medium">You</span>
      </div>
    </div>
  );
}
