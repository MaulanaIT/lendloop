"use client";

import { useEffect, useState } from "react";

/** Pause after the last keystroke before search text filters a list or reaches the URL. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * `value`, held back until it stops changing for `delayMs`. Clearing (an empty
 * string) applies at once so "Clear filters" and the search × never lag.
 */
export function useDebouncedValue(value: string, delayMs: number = SEARCH_DEBOUNCE_MS): string {
  const [debounced, setDebounced] = useState(value);
  // Reset during render (not in the effect) so the next search after a clear
  // never briefly shows the old query's results.
  if (value === "" && debounced !== "") setDebounced("");

  useEffect(() => {
    if (value === "") return;
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return value === "" ? "" : debounced;
}
