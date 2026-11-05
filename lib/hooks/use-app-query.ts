"use client";

import { useQuery_experimental } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useCallback, useState } from "react";
import { parseAppError } from "@/lib/domain/errors";
import { useViewer } from "./use-viewer";

export type AppQueryState<T> = {
  data: T | undefined;
  isLoading: boolean;
  /** Parsed ConvexError; `code` drives 403 / 404 / inline error rendering. */
  error: ReturnType<typeof parseAppError> | null;
  retry: () => void;
};

/**
 * Wraps Convex's realtime query with the { data, isLoading, error } shape every
 * screen uses. Authenticated queries wait until the viewer row is synced so
 * they never race `users.store`. Pass `{ public: true }` for visitor queries.
 */
export function useAppQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query> | "skip",
  opts: { public?: boolean } = {},
): AppQueryState<FunctionReturnType<Query>> {
  const { status } = useViewer();
  const [paused, setPaused] = useState(false);
  const ready = opts.public || status === "ready";

  const result = useQuery_experimental({
    query,
    args: ready && !paused && args !== "skip" ? args : "skip",
  });

  // Toggling to "skip" for one tick drops the cached error and resubscribes.
  const retry = useCallback(() => {
    setPaused(true);
    setTimeout(() => setPaused(false), 0);
  }, []);

  if (result.status === "success") {
    return { data: result.data, isLoading: false, error: null, retry };
  }
  if (result.status === "error") {
    return { data: undefined, isLoading: false, error: parseAppError(result.error), retry };
  }
  // "pending" covers both loading and skipped; a signed-out viewer on a
  // protected page is redirected by proxy.ts before it gets here.
  return { data: undefined, isLoading: true, error: null, retry };
}
