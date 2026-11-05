"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { AppQueryState } from "@/lib/hooks/use-app-query";

type ReportForbidden = () => void;

const AdminGateContext = createContext<ReportForbidden>(() => {});

/** Lets admin pages tell the admin layout to swap everything for the 403 page. */
export function AdminGateProvider({ onForbidden, children }: { onForbidden: ReportForbidden; children: ReactNode }) {
  return <AdminGateContext.Provider value={onForbidden}>{children}</AdminGateContext.Provider>;
}

/**
 * Maps a FORBIDDEN query error to the admin 403 page. The layout's role check
 * is only a convenience; this covers a role that changed mid-session, where
 * the server (requireAdmin) is the one that says no.
 */
export function useAdminForbidden(error: AppQueryState<unknown>["error"]) {
  const report = useContext(AdminGateContext);
  const forbidden = error?.code === "FORBIDDEN";
  useEffect(() => {
    if (forbidden) report();
  }, [forbidden, report]);
}
