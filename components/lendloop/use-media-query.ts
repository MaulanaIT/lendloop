"use client";

import { useSyncExternalStore } from "react";

/** Live `matchMedia` result. Returns `serverValue` during SSR and hydration. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** ≥768px (brief A7 `md`): desktop nav, centered dialogs, 2-month calendar. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)", true);
}
