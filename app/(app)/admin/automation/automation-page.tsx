"use client";

import { useMutation } from "convex/react";
import { Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  FiltersButton,
  FiltersSheet,
  NoMatches,
  ResultCount,
  SheetField,
} from "@/components/lendloop/admin/admin-filters";
import { DELIVERY_EVENT_LABEL } from "@/components/lendloop/admin/admin-copy";
import { useAdminForbidden } from "@/components/lendloop/admin/admin-gate";
import {
  AutomationHealthyBanner,
  AutomationSkeleton,
  AutomationSummaryCards,
  ConfigPresenceCard,
  HowFailuresSurfaceCard,
  WorkflowErrorsCard,
} from "@/components/lendloop/admin/automation-cards";
import { DeliveriesTable } from "@/components/lendloop/admin/deliveries-table";
import { DeliveryDetailDrawer } from "@/components/lendloop/admin/delivery-detail-drawer";
import {
  buildDeliveryRows,
  filterDeliveryRows,
  type DeliveryEventFilter,
  type DeliveryRow,
  type DeliveryStatusFilter,
} from "@/components/lendloop/admin/delivery-rows";
import { ReminderRunsTable } from "@/components/lendloop/admin/reminder-runs-table";
import { useOffline } from "@/components/lendloop/banners";
import { EmptyState } from "@/components/lendloop/empty-state";
import { ErrorState } from "@/components/lendloop/error-state";
import { useNow } from "@/components/lendloop/use-now";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { OFFLINE_ACTION_REASON } from "@/lib/copy";
import { ERROR_CATEGORY_LABEL, NOTIFICATION_EVENTS } from "@/lib/domain/automation";
import type { DeliveryDTO } from "@/lib/domain/dto";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { toast, toastAppError } from "@/lib/toast";

type Tab = "deliveries" | "runs";

/** Admin · Automation (brief A6/B13): n8n delivery health, retries, and configuration presence. */
export function AdminAutomationPage() {
  const { data, isLoading, error, retry } = useAppQuery(api.admin.automation, {});
  useAdminForbidden(error);
  const retryDelivery = useMutation(api.admin.retryDelivery);
  const offline = useOffline();
  const now = useNow(30_000);

  const [tab, setTab] = useState<Tab>("deliveries");
  const [status, setStatus] = useState<DeliveryStatusFilter>("all");
  const [event, setEvent] = useState<DeliveryEventFilter>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(new Set());
  const tabsRef = useRef<HTMLDivElement>(null);
  const awaitingRetry = useRef(new Set<string>());

  // Toast the outcome of a manual retry once the realtime query shows it.
  useEffect(() => {
    for (const d of data?.deliveries ?? []) {
      if (!awaitingRetry.current.has(d._id)) continue;
      if (d.status === "sent") {
        awaitingRetry.current.delete(d._id);
        toast.success("Delivered on retry.", {
          description: "Same idempotency key, so no duplicate record.",
        });
      } else if (d.status === "failed") {
        awaitingRetry.current.delete(d._id);
        toast.error("Retry failed.", {
          description: d.errorCategory ? `Error category: ${ERROR_CATEGORY_LABEL[d.errorCategory]}.` : undefined,
        });
      }
    }
  }, [data]);

  const rows = useMemo(() => buildDeliveryRows(data?.deliveries ?? []), [data]);
  const shown = filterDeliveryRows(rows, status, event);
  // Look the row up on every render so the open drawer follows realtime updates.
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const filterCount = (status !== "all" ? 1 : 0) + (event !== "all" ? 1 : 0);

  const clear = () => {
    setStatus("all");
    setEvent("all");
  };

  const reviewFailures = () => {
    setTab("deliveries");
    setStatus("failed");
    setEvent("all");
    // An explicit "smooth" ignores the CSS reduced-motion override, so check it here.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tabsRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };

  const view = (row: DeliveryRow) => {
    setSelectedId(row.id);
    setDrawerOpen(true);
  };

  const onRetry = async (d: DeliveryDTO) => {
    if (retrying.has(d._id)) return;
    setRetrying((s) => new Set(s).add(d._id));
    try {
      // Convex re-checks the admin role, that it failed, and that the event
      // still applies to the loan; it reuses the same idempotency key.
      await retryDelivery({ deliveryId: d._id });
      // The send itself is async; the effect below reports how it ends.
      awaitingRetry.current.add(d._id);
    } catch (err) {
      toastAppError(err);
    } finally {
      setRetrying((s) => {
        const n = new Set(s);
        n.delete(d._id);
        return n;
      });
    }
  };

  if (isLoading) return <AutomationSkeleton />;
  if (error || !data) {
    return (
      <ErrorState
        className="mt-6"
        title="Couldn't load automation status."
        description="Deliveries keep running in n8n. Try again in a moment."
        onRetry={retry}
      />
    );
  }

  const healthy =
    data.failed24h === 0 &&
    data.notifications24h.failed === 0 &&
    data.notifications24h.retrying === 0 &&
    (data.lastRun?.failed ?? 0) === 0;
  const blockedReason = offline ? OFFLINE_ACTION_REASON : null;

  let deliveries;
  if (rows.length === 0) {
    deliveries = (
      <EmptyState
        icon={Zap}
        title="No deliveries in the last 7 days."
        description="Notifications show up here as they're sent."
      />
    );
  } else if (shown.length === 0) {
    deliveries = <NoMatches title="No deliveries match these filters." onClear={clear} />;
  } else {
    deliveries = (
      <DeliveriesTable
        rows={shown}
        nowMs={now}
        onView={view}
        onRetry={onRetry}
        retrying={retrying}
        blockedReason={blockedReason}
      />
    );
  }

  return (
    <>
      {healthy ? (
        <div className="mt-6">
          <AutomationHealthyBanner lastRunAt={data.lastRun?.finishedAt ?? null} nowMs={now} />
        </div>
      ) : null}
      <div className="mt-6">
        <AutomationSummaryCards data={data} nowMs={now} onReviewFailures={reviewFailures} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-7 scroll-mt-20" ref={tabsRef}>
        <TabsList aria-label="Automation">
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="runs">Reminder runs</TabsTrigger>
        </TabsList>

        <TabsContent value="deliveries" className="mt-4">
          {rows.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <FiltersButton count={filterCount} onClick={() => setSheetOpen(true)} />
              <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 md:flex">
                <StatusSelect aria-label="Status" value={status} onChange={setStatus} className="font-medium" />
                <EventSelect aria-label="Event" value={event} onChange={setEvent} className="font-medium" />
              </div>
              <ResultCount shown={shown.length} total={rows.length} />
            </div>
          ) : null}
          {deliveries}
        </TabsContent>

        <TabsContent value="runs" className="mt-4">
          <ReminderRunsTable runs={data.runs} deliveries={data.deliveries} />
        </TabsContent>
      </Tabs>

      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-4">
        <ConfigPresenceCard config={data.config} />
        <HowFailuresSurfaceCard />
        {data.workflowErrors.length > 0 ? <WorkflowErrorsCard errors={data.workflowErrors} nowMs={now} /> : null}
      </div>

      <FiltersSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        shown={shown.length}
        total={rows.length}
        onClear={clear}
      >
        <SheetField label="Status">
          <StatusSelect value={status} onChange={setStatus} wrapperClassName="flex" className="text-base" />
        </SheetField>
        <SheetField label="Event">
          <EventSelect value={event} onChange={setEvent} wrapperClassName="flex" className="text-base" />
        </SheetField>
      </FiltersSheet>

      <DeliveryDetailDrawer
        row={selected}
        open={drawerOpen && selected !== null}
        onOpenChange={setDrawerOpen}
        toolName={selected?.delivery.toolName ?? null}
        n8nBaseUrl={data.n8nBaseUrl}
        nowMs={now}
        onRetry={onRetry}
        retrying={retrying}
        blockedReason={blockedReason}
      />
    </>
  );
}

type SelectProps<V> = Omit<ComponentProps<typeof NativeSelect>, "value" | "onChange"> & {
  value: V;
  onChange: (v: V) => void;
};

function StatusSelect({ value, onChange, ...props }: SelectProps<DeliveryStatusFilter>) {
  return (
    <NativeSelect
      value={value}
      active={value !== "all"}
      onChange={(e) => onChange(e.target.value as DeliveryStatusFilter)}
      {...props}
    >
      <option value="all">All statuses</option>
      <option value="failed">Failed</option>
      <option value="retrying">Retrying</option>
      <option value="sent">Sent</option>
      <option value="duplicate">Duplicate ignored</option>
    </NativeSelect>
  );
}

function EventSelect({ value, onChange, ...props }: SelectProps<DeliveryEventFilter>) {
  return (
    <NativeSelect
      value={value}
      active={value !== "all"}
      onChange={(e) => onChange(e.target.value as DeliveryEventFilter)}
      {...props}
    >
      <option value="all">All events</option>
      {NOTIFICATION_EVENTS.map((ev) => (
        <option key={ev} value={ev}>
          {DELIVERY_EVENT_LABEL[ev]}
        </option>
      ))}
      <option value="duplicate">{DELIVERY_EVENT_LABEL.duplicate}</option>
    </NativeSelect>
  );
}
