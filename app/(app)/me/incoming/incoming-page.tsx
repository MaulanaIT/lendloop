"use client";

import { CircleCheck, History, Inbox, Repeat, type LucideIcon } from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useOffline } from "@/components/lendloop/banners";
import { EmptyState } from "@/components/lendloop/empty-state";
import { ErrorState } from "@/components/lendloop/error-state";
import { IncomingRow } from "@/components/lendloop/loans/incoming-row";
import { LoanRowsSkeleton, useStaleRows } from "@/components/lendloop/loans/loan-parts";
import { useLoanActions } from "@/components/lendloop/loans/use-loan-actions";
import { PageContainer, PageHeader } from "@/components/lendloop/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { clientToday } from "@/lib/config";
import type { LoanRowDTO } from "@/lib/domain/dto";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";

const TABS = ["pending", "active", "overdue", "history"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  pending: "Needs response",
  active: "Active & upcoming",
  overdue: "Overdue",
  history: "History",
};

const EMPTY: Record<Tab, { icon: LucideIcon; title: string; description?: string }> = {
  pending: { icon: Inbox, title: "No requests waiting.", description: "You're all caught up." },
  active: { icon: Repeat, title: "Nothing out on loan." },
  overdue: { icon: CircleCheck, title: "Nothing overdue." },
  history: { icon: History, title: "No past loans yet." },
};

function tabOf(status: LoanRowDTO["status"]): Tab {
  switch (status) {
    case "pending":
      return "pending";
    case "upcoming":
    case "on_loan":
      return "active";
    case "overdue":
      return "overdue";
    default:
      return "history";
  }
}

function groupRows(rows: LoanRowDTO[], arrived: ReadonlySet<string>): Record<Tab, LoanRowDTO[]> {
  const g: Record<Tab, LoanRowDTO[]> = { pending: [], active: [], overdue: [], history: [] };
  for (const r of rows) g[tabOf(r.status)].push(r);
  // Requests that arrived while the page was open go on top; the rest oldest first.
  g.pending.sort((a, b) => Number(arrived.has(b._id)) - Number(arrived.has(a._id)) || a.createdAt - b.createdAt);
  // On loan before upcoming, then by start date.
  g.active.sort(
    (a, b) => Number(b.status === "on_loan") - Number(a.status === "on_loan") || a.startDate.localeCompare(b.startDate),
  );
  g.overdue.sort((a, b) => a.endDate.localeCompare(b.endDate));
  // History keeps the server order (newest ref first).
  return g;
}

export function IncomingPage() {
  return (
    <Suspense>
      <Incoming />
    </Suspense>
  );
}

type Arrivals = {
  rows: LoanRowDTO[] | undefined;
  seen: ReadonlySet<string> | null;
  arrived: ReadonlySet<string>;
};

/**
 * Rows that are highlighted for 2s: pending requests that arrive over the
 * realtime subscription after the first load, and rows the owner just
 * approved. Arrivals are detected while rendering (no effect round-trip) by
 * comparing against the ids already seen.
 */
function useHighlights(rows: LoanRowDTO[] | undefined) {
  const [flash, setFlash] = useState<{ ids: ReadonlySet<string>; key: number }>({ ids: new Set(), key: 0 });
  const [announce, setAnnounce] = useState("");
  const [track, setTrack] = useState<Arrivals>({ rows: undefined, seen: null, arrived: new Set() });

  if (rows && rows !== track.rows) {
    const ids = rows.map((r) => r._id as string);
    if (track.seen === null) {
      setTrack({ rows, seen: new Set(ids), arrived: track.arrived });
    } else {
      const fresh = rows.filter((r) => r.status === "pending" && !track.seen!.has(r._id));
      setTrack({
        rows,
        seen: new Set([...track.seen, ...ids]),
        arrived: fresh.length ? new Set([...track.arrived, ...fresh.map((r) => r._id)]) : track.arrived,
      });
      if (fresh.length) {
        setFlash((f) => ({ ids: new Set(fresh.map((r) => r._id)), key: f.key + 1 }));
        const r = fresh[fresh.length - 1];
        setAnnounce(`New request from ${r.borrower.name} for ${r.tool.name}`);
      }
    }
  }

  useEffect(() => {
    if (!flash.ids.size) return;
    const t = window.setTimeout(
      () => setFlash((f) => (f.key === flash.key ? { ids: new Set(), key: f.key } : f)),
      2000,
    );
    return () => window.clearTimeout(t);
  }, [flash]);

  const highlight = useCallback((id: string) => setFlash((f) => ({ ids: new Set([id]), key: f.key + 1 })), []);
  return { flashing: flash.ids, arrived: track.arrived, announce, highlight };
}

function Incoming() {
  // The tab lives in the URL, so Back from a loan and refresh return to it.
  const url = useUrlFilters({ tab: "pending" });
  const param = url.get("tab") as Tab;
  const tab: Tab = TABS.includes(param) ? param : "pending";
  const setTab = (t: Tab) => url.set({ tab: t });
  const { data, isLoading, error, retry } = useAppQuery(api.loans.incoming, {});
  const { stale, mark } = useStaleRows();
  const actions = useLoanActions({ onStale: mark });
  const offline = useOffline();
  const today = clientToday();
  const { flashing, arrived, announce, highlight } = useHighlights(data);

  const groups = groupRows(data ?? [], arrived);
  const counted = !isLoading && !error;

  const onApproved = (loan: LoanRowDTO) => {
    // Follow the approved row to its new tab (brief B8: optimistic move to Active & upcoming).
    setTab("active");
    highlight(loan._id);
  };

  const panel = (which: Tab) => {
    if (isLoading) return <LoanRowsSkeleton lead="avatar" label="Loading incoming requests" />;
    if (error) {
      return (
        <ErrorState
          title="Couldn't load incoming requests."
          description="Nothing has changed on your loans. Try again in a moment."
          onRetry={retry}
        />
      );
    }
    const rows = groups[which];
    if (!rows.length) {
      const e = EMPTY[which];
      return <EmptyState icon={e.icon} title={e.title} description={e.description} />;
    }
    return (
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((loan) => (
          <IncomingRow
            key={loan._id}
            loan={loan}
            today={today}
            actions={actions}
            offline={offline}
            stale={stale.has(loan._id)}
            flash={flashing.has(loan._id)}
            onApproved={onApproved}
          />
        ))}
      </ul>
    );
  };

  return (
    <PageContainer>
      <p role="status" className="sr-only">
        {announce}
      </p>
      <PageHeader title="Incoming" subtitle="Requests and loans on your tools" />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-5">
        <TabsList aria-label="Incoming">
          {TABS.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              count={counted ? groups[t].length : undefined}
              tone={t === "overdue" && groups.overdue.length > 0 ? "danger" : "default"}
            >
              {TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t} value={t}>
            {panel(t)}
          </TabsContent>
        ))}
      </Tabs>
    </PageContainer>
  );
}
