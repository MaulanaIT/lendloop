"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoryFilter } from "@/components/lendloop/category-chip";
import { CATEGORY_META, categoryFromSlug } from "@/lib/domain/categories";

export type BrowseFilters = {
  /** Live search text (updates the URL after a short pause). */
  q: string;
  category: CategoryFilter;
  availableOnly: boolean;
};

const SEARCH_URL_DELAY_MS = 250;

function toQuery(f: BrowseFilters): string {
  const p = new URLSearchParams();
  if (f.category !== "all") p.set("category", CATEGORY_META[f.category].slug);
  if (f.availableOnly) p.set("available", "1");
  const q = f.q.trim();
  if (q) p.set("q", q);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Browse filters live in the query string (?category=garden&available=1&q=drill)
 * so links, refresh and Back keep them. Category and the switch write the URL
 * immediately; typing updates it after a short pause. Uses router.replace
 * without scrolling so filtering never jumps the page or floods history.
 */
export function useBrowseFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const category: CategoryFilter = categoryFromSlug(params.get("category")) ?? "all";
  const availableOnly = params.get("available") === "1";
  const urlQ = params.get("q") ?? "";

  // Local copy so the input stays responsive; re-synced when the URL changes
  // from outside (Back/forward, "Clear filters").
  const [q, setQState] = useState(urlQ);
  const [seenUrlQ, setSeenUrlQ] = useState(urlQ);
  const [pendingQ, setPendingQ] = useState<string | null>(null);
  if (urlQ !== seenUrlQ) {
    setSeenUrlQ(urlQ);
    setPendingQ(null);
    // Our own debounced write landing must not clobber newer keystrokes.
    if (urlQ !== pendingQ) setQState(urlQ);
  }

  const replace = useCallback(
    (next: BrowseFilters) => router.replace(`${pathname}${toQuery(next)}`, { scroll: false }),
    [router, pathname],
  );

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const setQ = (value: string) => {
    setQState(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPendingQ(value.trim());
      replace({ q: value, category, availableOnly });
    }, SEARCH_URL_DELAY_MS);
  };

  // Each write carries the latest local search text, so a pending search write is dropped.
  const write = (next: BrowseFilters) => {
    window.clearTimeout(timer.current);
    setPendingQ(next.q.trim());
    replace(next);
  };
  const setCategory = (value: CategoryFilter) => write({ q, category: value, availableOnly });
  const setAvailableOnly = (value: boolean) => write({ q, category, availableOnly: value });
  const clear = () => {
    setQState("");
    write({ q: "", category: "all", availableOnly: false });
  };

  return {
    filters: { q, category, availableOnly } satisfies BrowseFilters,
    setQ,
    setCategory,
    setAvailableOnly,
    clear,
    hasFilters: q.trim() !== "" || category !== "all" || availableOnly,
  };
}
