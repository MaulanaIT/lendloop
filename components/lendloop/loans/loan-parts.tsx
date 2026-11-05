"use client";

import { ChevronRight, LoaderCircle, Mail } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ActivityTimeline, ActivityTimelineSkeleton } from "@/components/lendloop/activity-timeline";
import { ErrorState } from "@/components/lendloop/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LoanRowDTO } from "@/lib/domain/dto";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { cn } from "@/lib/utils";

/** "✉ Contact unlocked: rina.s@example.com": only rendered when the server sent an email (party + active loan). */
export function ContactLine({ email, className }: { email: string; className?: string }) {
  return (
    <p className={cn("m-0 flex flex-wrap items-center gap-1.5 text-sm", className)}>
      <Mail aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">Contact unlocked:</span>
      <a href={`mailto:${email}`} className="font-medium [overflow-wrap:anywhere]">
        {email}
      </a>
    </p>
  );
}

/**
 * Footer "› Activity (n)" toggle under a loan row. The timeline query only
 * subscribes while the panel is open, so a long list doesn't open one
 * subscription per row.
 */
export function ActivityToggle({ loan }: { loan: LoanRowDTO }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="border-t border-border px-3 py-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2 font-medium text-muted-foreground tabular hover:text-foreground md:min-h-10"
      >
        <ChevronRight
          aria-hidden
          className={cn("size-4 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
        />
        Activity ({loan.activityCount})
      </button>
      {open ? (
        <div id={panelId} className="mt-1 mb-2 px-2">
          <InlineTimeline loan={loan} />
        </div>
      ) : null}
    </div>
  );
}

function InlineTimeline({ loan }: { loan: LoanRowDTO }) {
  const { data, isLoading, error, retry } = useAppQuery(api.loans.timeline, { loanId: loan._id });
  if (isLoading) return <ActivityTimelineSkeleton rows={3} />;
  if (error || !data) {
    return (
      <ErrorState variant="banner" title="Couldn't load the activity for this loan." onRetry={retry} className="mb-2" />
    );
  }
  // Party view only: My requests / Incoming never show admin technical fields.
  return <ActivityTimeline events={data} loan={loan} />;
}

/** Red inline note shown when the server says someone acted first (ALREADY_HANDLED). */
export function StaleNote({ pending }: { pending: boolean }) {
  return (
    <p
      role="alert"
      className="m-0 flex items-center gap-2 self-start rounded-md border border-danger-border bg-danger-bg px-2.5 py-2 text-sm font-medium text-danger"
    >
      <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
      {pending ? "This request was already handled. Refreshing…" : "This loan was already handled. Refreshing…"}
    </p>
  );
}

/**
 * Tracks rows whose action came back ALREADY_HANDLED. Each id shows the stale
 * note for ~2s; by then the realtime query has delivered the new state.
 */
export function useStaleRows(ms = 2000) {
  const [stale, setStale] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => window.clearTimeout(t));
  }, []);
  const mark = useCallback(
    (id: Id<"loans">) => {
      setStale((s) => new Set(s).add(id));
      window.clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        window.setTimeout(() => {
          timers.current.delete(id);
          setStale((s) => {
            const next = new Set(s);
            next.delete(id);
            return next;
          });
        }, ms),
      );
    },
    [ms],
  );
  return { stale, mark };
}

/** Card-shaped placeholders for loan lists (3 rows). `lead` is the tile (My requests) or avatar (Incoming). */
export function LoanRowsSkeleton({ lead, label }: { lead: "tile" | "avatar"; label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col gap-3">
      {[0, 1, 2].map((k) => (
        <div key={k} className="flex gap-3.5 rounded-lg border border-border bg-card p-5">
          {lead === "tile" ? (
            <Skeleton className="size-12 shrink-0 rounded-tile" />
          ) : (
            <Skeleton className="size-11 shrink-0 rounded-full" />
          )}
          <div className="flex flex-1 flex-col gap-2.5">
            <Skeleton className={cn("h-4", lead === "tile" ? "w-[45%]" : "w-[30%]")} />
            <Skeleton className={cn("h-3", lead === "tile" ? "w-[30%]" : "w-[55%]")} />
            {lead === "tile" ? <Skeleton className="h-[26px] w-[150px] rounded-full" /> : null}
            <Skeleton className={cn("h-3", lead === "tile" ? "w-[55%]" : "w-[35%]")} />
          </div>
          <Skeleton className={cn("hidden h-10 rounded-md sm:block", lead === "tile" ? "w-[120px]" : "w-[180px]")} />
        </div>
      ))}
    </div>
  );
}
