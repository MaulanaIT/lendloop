"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const TEXT_URL_DELAY_MS = 250;

/**
 * Page filters and tabs kept in the query string, so Back, refresh and a
 * shared link restore them (the same pattern as Browse's use-browse-filters).
 * A value equal to its default is left out of the URL. Writes use the native
 * history.replaceState, which Next syncs into useSearchParams without a
 * server round trip, so a tab switch is instant and never floods history.
 * Callers validate what they read (a hand-edited URL can hold anything).
 * Needs a Suspense boundary above it (useSearchParams).
 */
export function useUrlFilters<K extends string>(defaults: Record<K, string>) {
  const params = useSearchParams();
  const pathname = usePathname();

  const get = (key: K): string => params.get(key) ?? defaults[key];

  const set = (patch: Partial<Record<K, string>>) => {
    // From the live URL: a debounced search write may land after other changes.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch) as [K, string][]) {
      if (value === defaults[key]) next.delete(key);
      else next.set(key, value);
    }
    const s = next.toString();
    window.history.replaceState(null, "", `${pathname}${s ? `?${s}` : ""}`);
  };

  return { get, set };
}

/**
 * Search text for useUrlFilters: the input updates at once, the URL after a
 * short pause. Re-syncs when the URL changes from outside (Back, "Clear").
 */
export function useUrlText(urlValue: string, write: (value: string) => void) {
  const [text, setText] = useState(urlValue);
  const [seen, setSeen] = useState(urlValue);
  const [pending, setPending] = useState<string | null>(null);
  if (urlValue !== seen) {
    setSeen(urlValue);
    setPending(null);
    // Our own debounced write landing must not clobber newer keystrokes.
    if (urlValue !== pending) setText(urlValue);
  }

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const change = (value: string) => {
    setText(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPending(value.trim());
      write(value.trim());
    }, TEXT_URL_DELAY_MS);
  };
  /** Set at once (e.g. "Clear filters"), dropping a pending write. */
  const reset = (value: string) => {
    window.clearTimeout(timer.current);
    setText(value);
  };

  return { text, change, reset };
}
