"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { ViewerDTO } from "@/lib/domain/dto";

type ViewerState =
  | { status: "loading"; viewer: null }
  | { status: "signed_out"; viewer: null }
  | { status: "ready"; viewer: ViewerDTO };

const ViewerContext = createContext<ViewerState>({ status: "loading", viewer: null });

/**
 * Syncs the Clerk identity into Convex (`users.store`) once per session and
 * exposes the viewer's row. The role comes from Convex, never from Clerk or
 * the client — the UI reads it only to decide what to show.
 */
export function ViewerProvider({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    store()
      .then(() => {
        if (!cancelled) setSynced(true);
      })
      .catch(() => {
        // Leave the app in "loading"; the next auth refresh retries the sync.
      });
    return () => {
      cancelled = true;
      setSynced(false);
    };
  }, [isAuthenticated, store]);

  const viewer = useQuery(api.users.me, isAuthenticated && synced ? {} : "skip");

  let state: ViewerState;
  if (isLoading) state = { status: "loading", viewer: null };
  else if (!isAuthenticated) state = { status: "signed_out", viewer: null };
  else if (viewer) state = { status: "ready", viewer };
  else state = { status: "loading", viewer: null };

  return <ViewerContext.Provider value={state}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerState {
  return useContext(ViewerContext);
}
