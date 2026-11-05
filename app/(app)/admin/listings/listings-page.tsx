"use client";

import {
  Ban,
  CircleCheck,
  Ellipsis,
  Eye,
  Package,
  Repeat,
  Trash,
  TriangleExclamationPoint,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { Suspense, useMemo, useState, type ComponentProps } from "react";
import {
  CategorySelect,
  FiltersButton,
  FiltersSheet,
  NoMatches,
  ResultCount,
  SheetField,
  type CategoryFilterValue,
} from "@/components/lendloop/admin/admin-filters";
import { useAdminForbidden } from "@/components/lendloop/admin/admin-gate";
import { AdminTable, AdminTableSkeleton, type AdminColumn } from "@/components/lendloop/admin/admin-table";
import { useOffline } from "@/components/lendloop/banners";
import { CategoryIcon, CategoryTile } from "@/components/lendloop/category-icon";
import { RemoveListingDialog } from "@/components/lendloop/dialogs";
import { EmptyState } from "@/components/lendloop/empty-state";
import { ErrorState } from "@/components/lendloop/error-state";
import { MsDay } from "@/components/lendloop/relative-time";
import { TrustedLenderBadge } from "@/components/lendloop/trusted-badge";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import { TOAST_COPY } from "@/lib/copy";
import { CATEGORY_META, categoryFromSlug, type RemoveReason } from "@/lib/domain/categories";
import type { AdminListingDTO } from "@/lib/domain/dto";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useUrlFilters, useUrlText } from "@/lib/hooks/use-url-filters";
import { toast, toastAppError } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ListingStatus = AdminListingDTO["status"];
type StatusFilter = Exclude<ListingStatus, "removed"> | "all";
const STATUS_FILTERS: readonly StatusFilter[] = ["all", "available", "on_loan", "overdue"];

const STATUS_PILL: Record<ListingStatus, { label: string; icon: LucideIcon; className: string }> = {
  available: {
    label: "Available",
    icon: CircleCheck,
    className: "border-success-border bg-success-bg text-success",
  },
  on_loan: {
    label: "On loan",
    icon: Repeat,
    className: "border-[var(--st-onloan-border)] bg-[var(--st-onloan-bg)] text-[var(--st-onloan-text)]",
  },
  overdue: {
    label: "Overdue",
    icon: TriangleExclamationPoint,
    className: "border-danger-border bg-danger-bg text-danger",
  },
  removed: {
    label: "Removed",
    icon: Ban,
    className: "border-[var(--st-declined-border)] bg-[var(--st-declined-bg)] text-[var(--st-declined-text)]",
  },
};

function removedLine(r: NonNullable<AdminListingDTO["removed"]>) {
  const why = r.reason === "Other" && r.detail ? `Other: ${r.detail}` : r.reason;
  return (
    <>
      Removed by {r.byName} · <MsDay ms={r.at} /> · {why}
    </>
  );
}

/** Admin · Listings (brief B10): every listing, with soft removal. */
export function AdminListingsPage() {
  // The filters live in the URL (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense>
      <AdminListings />
    </Suspense>
  );
}

function AdminListings() {
  const { data, isLoading, error, retry } = useAppQuery(api.admin.listings, {});
  useAdminForbidden(error);
  const removeListing = useMutation(api.admin.removeListing);
  const offline = useOffline();

  // Kept in the URL so viewing a listing and coming back keeps the filtered view.
  const url = useUrlFilters({ status: "all", category: "all", q: "", removed: "show" });
  const statusParam = url.get("status") as StatusFilter;
  const status: StatusFilter = STATUS_FILTERS.includes(statusParam) ? statusParam : "all";
  const category: CategoryFilterValue = categoryFromSlug(url.get("category")) ?? "all";
  const showRemoved = url.get("removed") !== "hide";
  const search = useUrlText(url.get("q"), (q) => url.set({ q }));
  const query = search.text;
  const setStatus = (v: StatusFilter) => url.set({ status: v });
  const setCategory = (v: CategoryFilterValue) => url.set({ category: v === "all" ? "all" : CATEGORY_META[v].slug });
  const setShowRemoved = (v: boolean) => url.set({ removed: v ? "show" : "hide" });
  const [sheetOpen, setSheetOpen] = useState(false);
  // Only the id: the dialog reads the live row, so its impact summary follows
  // realtime changes and it closes if another admin removes the listing first.
  const [targetId, setTargetId] = useState<AdminListingDTO["_id"] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const all = useMemo(() => data ?? [], [data]);
  const target = targetId ? (all.find((l) => l._id === targetId && !l.removed) ?? null) : null;
  // Rows follow the search after a short pause; the input itself stays instant.
  const q = useDebouncedValue(query.trim()).toLowerCase();
  const rows = all.filter(
    (t) =>
      (category === "all" || t.category === category) &&
      (status === "all" || t.status === status) &&
      (showRemoved || t.status !== "removed") &&
      (!q || `${t.name} ${t.owner.name}`.toLowerCase().includes(q)),
  );
  const filterCount = (category !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0) + (showRemoved ? 0 : 1);

  const clear = () => {
    search.reset("");
    url.set({ status: "all", category: "all", q: "", removed: "show" });
  };

  const askRemove = (t: AdminListingDTO) => {
    if (offline) {
      toast.message("You're offline", {
        description: "Reconnect to remove listings.",
        icon: WifiOff,
      });
      return;
    }
    setTargetId(t._id);
    setDialogOpen(true);
  };

  const confirmRemove = async ({ reason, detail }: { reason: RemoveReason; detail: string | null }) => {
    if (!target) return;
    try {
      // Convex re-checks admin role, reason and detail; this is only the trigger.
      await removeListing({
        toolId: target._id,
        reason,
        detail: detail ?? undefined,
      });
      toast.success(TOAST_COPY.listingRemoved);
    } catch (err) {
      toastAppError(err);
      throw err;
    }
  };

  const columns: AdminColumn<AdminListingDTO>[] = [
    {
      key: "tool",
      header: "Tool",
      cell: (t) => <ToolCell listing={t} />,
    },
    {
      key: "owner",
      header: "Owner",
      className: "w-[170px]",
      cellClassName: (t) => (t.removed ? "text-muted-foreground" : undefined),
      cell: (t) => (
        <span className="inline-flex items-center gap-1">
          {t.owner.name}
          {t.owner.trusted ? <TrustedLenderBadge size="sm" /> : null}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      className: "w-[170px]",
      cellClassName: (t) => (t.removed ? "text-muted-foreground" : undefined),
      cell: (t) => (
        <span className="inline-flex items-center gap-1.5">
          <CategoryIcon category={t.category} colored={!t.removed} className="size-3.5" />
          {CATEGORY_META[t.category].label}
        </span>
      ),
    },
    {
      key: "listed",
      header: "Listed",
      className: "w-[90px]",
      cellClassName: "whitespace-nowrap text-muted-foreground tabular",
      cell: (t) => <MsDay ms={t.createdAt} />,
    },
    {
      key: "status",
      header: "Status",
      className: "w-[120px]",
      cell: (t) => <StatusPill listing={t} />,
    },
    {
      key: "actions",
      header: "Actions",
      srOnlyHeader: true,
      className: "w-[52px] px-2",
      cellClassName: "px-2 text-right",
      cell: (t) => <RowMenu listing={t} onRemove={askRemove} compact />,
    },
  ];

  let body;
  if (isLoading) {
    body = (
      <AdminTableSkeleton
        label="Loading listings"
        cells={["size-7 rounded-sm", "h-3 w-[28%]", "h-3 w-[14%]", "ml-auto h-5 w-20 rounded-full"]}
      />
    );
  } else if (error) {
    body = (
      <ErrorState
        title="Couldn't load listings."
        description="Nothing was changed. Try again in a moment."
        onRetry={retry}
      />
    );
  } else if (all.length === 0) {
    body = <EmptyState icon={Package} title="No listings yet." />;
  } else if (rows.length === 0) {
    body = <NoMatches title="No listings match these filters." onClear={clear} />;
  } else {
    body = (
      <AdminTable
        label="Listings"
        rows={rows}
        columns={columns}
        rowKey={(t) => t._id}
        rowHeight={44}
        rowClassName={(t) => (t.removed ? "bg-muted" : undefined)}
        renderCard={(t) => <ListingCard listing={t} onRemove={askRemove} />}
      />
    );
  }

  const ready = !isLoading && !error && all.length > 0;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <SearchInput
          aria-label="Search listings by tool or owner"
          placeholder="Search tool or owner"
          value={query}
          onChange={(e) => search.change(e.target.value)}
          wrapperClassName="flex-[1_1_240px] md:max-w-[320px]"
        />
        <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 md:flex">
          <CategorySelect aria-label="Category" value={category} onChange={setCategory} className="font-medium" />
          <ListingStatusSelect aria-label="Status" value={status} onChange={setStatus} className="font-medium" />
          <Switch checked={showRemoved} onCheckedChange={setShowRemoved} className="px-1">
            Show removed
          </Switch>
        </div>
        <FiltersButton count={filterCount} onClick={() => setSheetOpen(true)} />
        {ready ? <ResultCount shown={rows.length} total={all.length} className="hidden md:block" /> : null}
      </div>

      <div className="mt-4">{body}</div>

      <FiltersSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        shown={rows.length}
        total={all.length}
        showLabel={rows.length === 1 ? "Show 1 listing" : `Show ${rows.length} listings`}
        onClear={clear}
      >
        <SheetField label="Category">
          <CategorySelect value={category} onChange={setCategory} wrapperClassName="flex" className="text-base" />
        </SheetField>
        <SheetField label="Status">
          <ListingStatusSelect value={status} onChange={setStatus} wrapperClassName="flex" className="text-base" />
        </SheetField>
        <Switch checked={showRemoved} onCheckedChange={setShowRemoved} labelFirst className="w-full text-base">
          Show removed
        </Switch>
      </FiltersSheet>

      {target ? (
        <RemoveListingDialog
          // A fresh dialog per listing: no reason left over from the last removal.
          key={target._id}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          listing={target}
          onConfirm={confirmRemove}
        />
      ) : null}
    </>
  );
}

function ListingStatusSelect({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof NativeSelect>, "value" | "onChange"> & {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  return (
    <NativeSelect
      value={value}
      active={value !== "all"}
      onChange={(e) => onChange(e.target.value as StatusFilter)}
      {...props}
    >
      <option value="all">All statuses</option>
      <option value="available">Available</option>
      <option value="on_loan">On loan</option>
      <option value="overdue">Overdue</option>
    </NativeSelect>
  );
}

function StatusPill({ listing }: { listing: AdminListingDTO }) {
  const { label, icon: Icon, className } = STATUS_PILL[listing.status];
  const days = listing.status === "overdue" ? listing.daysOverdue : 0;
  return (
    <Badge size="sm" className={className}>
      <Icon aria-hidden />
      {days > 0 ? `${label} · ${days} ${days === 1 ? "day" : "days"}` : label}
    </Badge>
  );
}

function ListingTile({ listing, size }: { listing: AdminListingDTO; size: "row" | "card" }) {
  const box = size === "row" ? "size-7 rounded-sm" : "size-10 rounded-md [&_svg]:size-5";
  // Removed listings lose their category color so the row reads as inactive.
  if (listing.removed) {
    return (
      <span aria-hidden className={cn("grid shrink-0 place-items-center bg-border text-muted-foreground", box)}>
        <CategoryIcon category={listing.category} colored={false} className="size-4" />
      </span>
    );
  }
  return <CategoryTile category={listing.category} size={32} className={box} />;
}

/** Removed listings are hidden from tools.get (404), so their name isn't a link. */
function ListingName({ listing, className }: { listing: AdminListingDTO; className?: string }) {
  if (listing.removed) return <span className={cn("text-muted-foreground", className)}>{listing.name}</span>;
  return (
    <Link href={`/tools/${listing._id}`} className={cn("text-foreground no-underline hover:text-primary", className)}>
      {listing.name}
    </Link>
  );
}

function ToolCell({ listing }: { listing: AdminListingDTO }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <ListingTile listing={listing} size="row" />
      <div className="flex min-w-0 flex-col">
        <ListingName listing={listing} className="font-medium" />
        {listing.removed ? <span className="text-xs text-muted-foreground">{removedLine(listing.removed)}</span> : null}
      </div>
    </div>
  );
}

function RowMenu({
  listing,
  onRemove,
  compact = false,
}: {
  listing: AdminListingDTO;
  onRemove: (t: AdminListingDTO) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  // A removed listing has nothing left to do here: it can't be viewed (404) or removed twice.
  if (listing.removed) return null;
  const label = `Actions for ${listing.name}`;
  return (
    <DropdownMenu modal={false}>
      <Tooltip content={label}>
        <DropdownMenuTrigger
          aria-label={label}
          className={cn(
            "inline-grid cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted",
            compact ? "size-11 md:size-8" : "-mt-2 size-11",
          )}
        >
          <Ellipsis aria-hidden className={compact ? "size-4" : "size-5"} />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent className="w-[200px]">
        <DropdownMenuItem onSelect={() => router.push(`/tools/${listing._id}`)}>
          <Eye aria-hidden />
          View listing
        </DropdownMenuItem>
        {/* Convex (admin.removeListing → requireAdmin) enforces this; the menu only offers it. */}
        <DropdownMenuItem variant="destructive" onSelect={() => onRemove(listing)}>
          <Trash aria-hidden />
          Remove listing
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ListingCard({ listing: t, onRemove }: { listing: AdminListingDTO; onRemove: (t: AdminListingDTO) => void }) {
  const muted = !!t.removed;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border py-3.5 pr-2 pl-3.5 shadow-ll-card",
        muted ? "bg-muted" : "bg-card",
      )}
    >
      <ListingTile listing={t} size="card" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <ListingName listing={t} className="font-semibold" />
          <span
            className={cn(
              "inline-flex flex-wrap items-center gap-1 text-[13px]",
              muted ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {t.owner.name}
            {t.owner.trusted ? <TrustedLenderBadge size="sm" /> : null}
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <span className="text-muted-foreground">{CATEGORY_META[t.category].label}</span>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <span className="text-muted-foreground">
              Listed <MsDay ms={t.createdAt} />
            </span>
          </span>
        </div>
        <span className="self-start">
          <StatusPill listing={t} />
        </span>
        {t.removed ? <span className="text-xs text-muted-foreground">{removedLine(t.removed)}</span> : null}
      </div>
      <div className="shrink-0">
        <RowMenu listing={t} onRemove={onRemove} />
      </div>
    </div>
  );
}
