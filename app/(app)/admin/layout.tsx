"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { AdminGateProvider } from "@/components/lendloop/admin/admin-gate";
import { AdminHeader, adminTabFromPath } from "@/components/lendloop/admin/admin-header";
import { PageContainer } from "@/components/lendloop/page-header";
import { FORBIDDEN_COPY, ForbiddenPage } from "@/components/lendloop/system-page";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { useViewer } from "@/lib/hooks/use-viewer";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { status, viewer } = useViewer();
  const { data: counts } = useAppQuery(api.users.navCounts, {});
  const pathname = usePathname();
  const [forbidden, setForbidden] = useState(false);
  const reportForbidden = useCallback(() => setForbidden(true), []);

  const active = adminTabFromPath(pathname);
  // The automation console has wide tables; the other sections use the normal page width.
  const width = active === "automation" ? "max-w-[1360px]" : "max-w-6xl";

  if (status !== "ready") {
    return (
      <PageContainer className={width} aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-11 w-full max-w-md" />
        <Skeleton className="mt-6 h-64 w-full rounded-lg" />
      </PageContainer>
    );
  }

  // UI convenience only: the role comes from the Convex users table, and every
  // admin.* function calls requireAdmin, so a non-admin gets FORBIDDEN from
  // the server no matter what this page renders. Pages also report a
  // FORBIDDEN query error here (role revoked mid-session).
  if (viewer.role !== "admin" || forbidden) {
    return <ForbiddenPage {...FORBIDDEN_COPY.admin} />;
  }

  return (
    <PageContainer className={width}>
      <AdminHeader active={active} failures={counts?.adminFailures24h ?? 0} />
      <AdminGateProvider onForbidden={reportForbidden}>{children}</AdminGateProvider>
    </PageContainer>
  );
}
