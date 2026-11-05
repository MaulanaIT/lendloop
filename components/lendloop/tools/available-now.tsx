"use client";

import { Lock, Package } from "lucide-react";
import { useMemo, useState } from "react";
import { CategoryChips, type CategoryFilter } from "@/components/lendloop/category-chip";
import { EmptyState } from "@/components/lendloop/empty-state";
import { ErrorState } from "@/components/lendloop/error-state";
import { PublicToolCardSkeleton, ToolCard } from "@/components/lendloop/tool-card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Category } from "@/lib/domain/categories";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { useViewer } from "@/lib/hooks/use-viewer";
import { LandingCta } from "./landing-cta";

const GRID = "grid grid-cols-2 gap-[clamp(16px,2vw,24px)] md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";

/**
 * Landing "Available now": live public list (tools.listPublic returns only
 * {_id, name, category}), category chips with counts, read-only cards.
 * The hero and CTA above never wait on this query.
 */
export function AvailableNow() {
  const { data, isLoading, error, retry } = useAppQuery(api.tools.listPublic, {}, { public: true });
  const { status } = useViewer();
  const [category, setCategory] = useState<CategoryFilter>("all");

  const counts = useMemo(() => {
    const out: Partial<Record<Category, number>> = {};
    for (const t of data ?? []) out[t.category] = (out[t.category] ?? 0) + 1;
    return out;
  }, [data]);

  const tools = data ?? [];
  const items = category === "all" ? tools : tools.filter((t) => t.category === category);
  const normal = !isLoading && !error && tools.length > 0;

  return (
    <section aria-labelledby="avail-h" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-t border-border pt-[clamp(32px,5vw,48px)]">
        <div>
          <h2 id="avail-h" className="m-0 font-display text-2xl font-semibold">
            Available now
          </h2>
          {normal ? (
            <p className="m-0 mt-1 text-base text-muted-foreground tabular">
              {tools.length} {tools.length === 1 ? "tool" : "tools"} available right now
            </p>
          ) : null}
        </div>
        <span className="text-[13px] text-muted-foreground">Updates live</span>
      </div>

      {normal ? (
        <CategoryChips
          className="mt-5"
          value={category}
          onChange={setCategory}
          counts={counts}
          total={tools.length}
          hideEmpty
          selectedIndicator="icon"
        />
      ) : null}

      <div className="mt-5">
        {isLoading ? (
          <div aria-busy="true" aria-label="Loading available tools" className="flex flex-col gap-5">
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-[104px] shrink-0 rounded-full" />
              ))}
            </div>
            <div className={GRID}>
              {Array.from({ length: 6 }, (_, i) => (
                <PublicToolCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : error ? (
          <ErrorState
            title="The tool list is temporarily unavailable."
            description={status === "ready" ? "You can still go to the board." : "You can still sign in."}
            onRetry={retry}
          />
        ) : tools.length === 0 ? (
          <EmptyState
            icon={Package}
            headingLevel="h3"
            className="py-12"
            title="No tools listed yet — be the first to lend one."
            action={<LandingCta className="h-11 px-[18px]" />}
          />
        ) : (
          <>
            <ul className={GRID}>
              {items.map((t) => (
                <li key={t._id} className="min-w-0">
                  <ToolCard variant="public" tool={t} />
                </li>
              ))}
            </ul>
            <p className="m-0 mt-6 flex items-center gap-2 text-muted-foreground">
              <Lock aria-hidden className="size-4 shrink-0" />
              Owner details are only visible to signed-in neighbors.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
