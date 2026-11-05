"use client";

import { HandHelping, History, Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { useOffline } from "@/components/lendloop/banners";
import { EmptyState } from "@/components/lendloop/empty-state";
import { ErrorState } from "@/components/lendloop/error-state";
import { LoanRowsSkeleton, useStaleRows } from "@/components/lendloop/loans/loan-parts";
import { OverdueBanner } from "@/components/lendloop/loans/overdue-banner";
import { RequestRow } from "@/components/lendloop/loans/request-row";
import { useLoanActions } from "@/components/lendloop/loans/use-loan-actions";
import { PageContainer, PageHeader } from "@/components/lendloop/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { clientToday } from "@/lib/config";
import type { LoanRowDTO } from "@/lib/domain/dto";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";

type Tab = "active" | "history";

const ACTIVE = new Set<LoanRowDTO["status"]>(["pending", "upcoming", "on_loan", "overdue"]);

export function MyRequestsPage() {
  return (
    <Suspense>
      <MyRequests />
    </Suspense>
  );
}

function MyRequests() {
  // The tab lives in the URL, so Back from a loan and refresh return to it.
  const url = useUrlFilters({ tab: "active" });
  const tab: Tab = url.get("tab") === "history" ? "history" : "active";
  const setTab = (t: Tab) => url.set({ tab: t });
  const { data, isLoading, error, retry } = useAppQuery(api.loans.myRequests, {});
  const { stale, mark } = useStaleRows();
  const actions = useLoanActions({ onStale: mark });
  const offline = useOffline();
  const today = clientToday();

  // The server already sorts overdue → on loan → upcoming → pending, then history newest first.
  const active = data?.filter((l) => ACTIVE.has(l.status)) ?? [];
  const history = data?.filter((l) => !ACTIVE.has(l.status)) ?? [];
  const overdue = active.filter((l) => l.status === "overdue");

  const panel = (rows: LoanRowDTO[], which: Tab) => {
    if (isLoading) return <LoanRowsSkeleton lead="tile" label="Loading requests" />;
    if (error) {
      return (
        <ErrorState
          title="Couldn't load your requests."
          description="Nothing has changed on your loans. Try again in a moment."
          onRetry={retry}
        />
      );
    }
    if (!rows.length) {
      return which === "active" ? (
        <EmptyState
          icon={HandHelping}
          title="Nothing borrowed yet."
          description="Find what you need and send a request — it takes 10 seconds."
          action={
            <Button asChild size="lg" className="pr-[18px] pl-3.5">
              <Link href="/tools">
                <Search aria-hidden />
                Browse tools
              </Link>
            </Button>
          }
        />
      ) : (
        <EmptyState icon={History} title="No past loans yet." />
      );
    }
    return (
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((loan) => (
          <RequestRow
            key={loan._id}
            loan={loan}
            today={today}
            actions={actions}
            offline={offline}
            stale={stale.has(loan._id)}
          />
        ))}
      </ul>
    );
  };

  const counted = !isLoading && !error;
  return (
    <PageContainer>
      <OverdueBanner overdue={overdue} />
      <PageHeader title="My requests" subtitle="Things you've asked to borrow" />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-5">
        <TabsList aria-label="Requests">
          <TabsTrigger value="active" count={counted ? active.length : undefined}>
            Active
          </TabsTrigger>
          <TabsTrigger value="history" count={counted ? history.length : undefined}>
            History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active">{panel(active, "active")}</TabsContent>
        <TabsContent value="history">{panel(history, "history")}</TabsContent>
      </Tabs>
    </PageContainer>
  );
}
