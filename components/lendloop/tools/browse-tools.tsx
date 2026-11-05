"use client";

import { Package, Plus, SearchX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/lendloop/empty-state";
import { ErrorState } from "@/components/lendloop/error-state";
import { PageContainer, PageHeader } from "@/components/lendloop/page-header";
import { ToolCard, ToolCardSkeleton } from "@/components/lendloop/tool-card";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { clientToday } from "@/lib/config";
import { isAvailableNow, type Availability } from "@/lib/domain/availability";
import { CATEGORY_META, type Category } from "@/lib/domain/categories";
import type { ToolCardDTO } from "@/lib/domain/dto";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useViewer } from "@/lib/hooks/use-viewer";
import { FilterBar } from "./filter-bar";
import { FirstRunBanner } from "./first-run-banner";
import { DeleteToolDialog, RemoveToolDialog, type ToolTarget } from "./tool-dialogs";
import { useBrowseFilters, type BrowseFilters } from "./use-browse-filters";

const GRID = "m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-4";

function matchesSearch(t: ToolCardDTO, q: string): boolean {
  if (!q) return true;
  return `${t.name} ${t.description} ${CATEGORY_META[t.category].label}`.toLowerCase().includes(q);
}

/** Fallback while My listings loads; Convex has the final say on delete. */
function blockedFromAvailability(a: Availability): string | null {
  if (a.kind === "on_loan" || a.kind === "overdue") return "Can't delete while lent out. Mark it returned first.";
  if (a.kind === "booked") return "Can't delete with an approved booking. Cancel it in Incoming first.";
  return null;
}

function noResultsTitle(f: BrowseFilters): string {
  const what = f.category === "all" ? "tools" : `${CATEGORY_META[f.category].label.toLowerCase()} tools`;
  const q = f.q.trim();
  if (q) return `No ${what} match “${q}”${f.availableOnly ? " right now" : ""}.`;
  return f.availableOnly ? `No ${what} available right now.` : `No ${what} listed yet.`;
}

/** "/tools" Browse (brief B3): search, category chips, Available only, member cards. */
export function BrowseTools() {
  const { viewer } = useViewer();
  const isAdmin = viewer?.role === "admin";
  const today = clientToday();
  const { filters, setQ, setCategory, setAvailableOnly, clear } = useBrowseFilters();
  const toolsQuery = useAppQuery(api.tools.list, {});
  const mine = useAppQuery(api.tools.myListings, {});

  const [deleteTarget, setDeleteTarget] = useState<ToolTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ToolTarget | null>(null);

  const tools = useMemo(() => toolsQuery.data ?? [], [toolsQuery.data]);
  const myById = useMemo(() => new Map((mine.data ?? []).map((l) => [l._id, l])), [mine.data]);

  // The input updates at once; the grid and counts follow after a short pause.
  const searchQ = useDebouncedValue(filters.q.trim());
  const ql = searchQ.toLowerCase();
  const base = useMemo(
    () => tools.filter((t) => matchesSearch(t, ql) && (!filters.availableOnly || isAvailableNow(t.availability))),
    [tools, ql, filters.availableOnly],
  );
  const counts = useMemo(() => {
    const out: Partial<Record<Category, number>> = {};
    for (const t of base) out[t.category] = (out[t.category] ?? 0) + 1;
    return out;
  }, [base]);
  const visible = filters.category === "all" ? base : base.filter((t) => t.category === filters.category);

  const loading = toolsQuery.isLoading;
  const failed = !!toolsQuery.error;
  const ready = !loading && !failed;
  // Only for neighbors with nothing listed yet (removed listings count as listed).
  const showBanner = ready && mine.data !== undefined && mine.data.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Browse tools"
        subtitle={
          toolsQuery.data ? (
            `${tools.length} ${tools.length === 1 ? "tool" : "tools"} from your neighbors`
          ) : loading ? (
            // A <span> because the subtitle renders inside a <p>.
            <span aria-hidden className="mt-1 inline-block h-4 w-52 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
          ) : null
        }
        actions={
          <Button asChild className="hidden pr-4 pl-3 md:inline-flex [&_svg]:size-5">
            <Link href="/tools/new">
              <Plus aria-hidden />
              List a tool
            </Link>
          </Button>
        }
      />

      {showBanner ? <FirstRunBanner /> : null}

      <FilterBar
        q={filters.q}
        onQChange={setQ}
        category={filters.category}
        onCategoryChange={setCategory}
        availableOnly={filters.availableOnly}
        onAvailableOnlyChange={setAvailableOnly}
        counts={counts}
        total={base.length}
        shown={visible.length}
        overall={tools.length}
        onClear={clear}
        showCount={ready}
      />

      <div className="mt-5">
        {loading ? (
          <ul aria-busy="true" aria-label="Loading tools" className={GRID}>
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i}>
                <ToolCardSkeleton />
              </li>
            ))}
          </ul>
        ) : failed ? (
          <ErrorState
            title="Couldn't load tools."
            description="Your search and filters are kept."
            onRetry={toolsQuery.retry}
          />
        ) : tools.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nothing listed yet."
            action={
              <Button asChild className="pr-4 pl-3 [&_svg]:size-5">
                <Link href="/tools/new">
                  <Plus aria-hidden />
                  List a tool
                </Link>
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={noResultsTitle({ ...filters, q: searchQ })}
            description="Try another category, or check back soon."
            action={
              <Button variant="outline" className="px-4" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <ul className={GRID}>
            {visible.map((t) => {
              const listing = myById.get(t._id);
              return (
                <li key={t._id} className="flex min-w-0">
                  <ToolCard
                    variant="member"
                    className="flex-1"
                    tool={t}
                    today={today}
                    isAdmin={isAdmin}
                    // UI gating only: tools.remove / admin.removeListing re-check ownership and role in Convex.
                    deleteBlockedReason={
                      t.isOwner ? (listing ? listing.deleteBlockedReason : blockedFromAvailability(t.availability)) : null
                    }
                    onDelete={() => setDeleteTarget({ _id: t._id, name: t.name })}
                    onRemove={() => setRemoveTarget({ _id: t._id, name: t.name })}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DeleteToolDialog
        tool={deleteTarget}
        pendingCount={deleteTarget ? (myById.get(deleteTarget._id)?.pendingCount ?? 0) : 0}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
      {isAdmin ? <RemoveToolDialog tool={removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)} /> : null}
    </PageContainer>
  );
}
