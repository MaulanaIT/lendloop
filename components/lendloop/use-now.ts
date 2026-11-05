"use client";

import { useEffect, useState } from "react";

/** Current time in ms, refreshed every `intervalMs` (default 60s) so relative labels stay fresh. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
