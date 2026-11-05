"use client";

import { ChevronDown, CopyX, Zap } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { timelineActorRole, timelineEventText, type DeliveryChipStatus } from "@/lib/copy";
import { ERROR_CATEGORY_LABEL, type ErrorCategory } from "@/lib/domain/automation";
import type { LoanRowDTO, TimelineEventDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { DeliveryChip } from "./delivery-chip";
import { PersonAvatar } from "./person";
import { DayDate, RelativeTime } from "./relative-time";

export type ActivityTimelineProps = {
  /** From loans.timeline, newest first. Admin-only rows ("attempt") are dropped unless `admin`. */
  events: TimelineEventDTO[];
  /** The loan's parties and dates, for event copy and person chips. */
  loan: Pick<LoanRowDTO, "owner" | "borrower" | "startDate" | "endDate">;
  /**
   * Admin view: every attempt as its own row, "Retrying 1/3 · timeout" chips,
   * and per-event "Details" with execution ID / idempotency key / channel /
   * error category (mono, copyable). Only admins receive these fields at all.
   */
  admin?: boolean;
  nowMs?: number;
  className?: string;
};

type Tone = "default" | "warning" | "danger" | "slate";

const NODE_TONE: Record<Tone, string> = {
  default: "border-border bg-card text-muted-foreground",
  warning: "border-warning-border bg-warning-bg text-warning",
  danger: "border-danger-border bg-danger-bg text-danger",
  slate: "border-[var(--st-declined-border)] bg-[var(--st-declined-bg)] text-[var(--st-declined-text)]",
};

type Detail = { label: string; value: string; what: string; danger?: boolean; truncate?: boolean };

/**
 * Loan activity (brief A6/B9): an <ol>, newest first, joined by a vertical
 * line. Human events get a solid dot + person chip; derived events a dot;
 * automation a Zap node + "Automated" chip + delivery chip. Users see one row
 * per notification with its latest status; admins also see each attempt and
 * ignored duplicate write-backs. Never renders payloads, emails or secrets.
 */
export function ActivityTimeline({ events, loan, admin = false, nowMs, className }: ActivityTimelineProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const ctx = {
    ownerName: loan.owner.name,
    borrowerName: loan.borrower.name,
    startDate: loan.startDate,
    endDate: loan.endDate,
  };
  const visible = admin ? events : events.filter((e) => e.kind !== "attempt");

  return (
    <ol aria-label="Activity, newest first" className={cn("m-0 flex list-none flex-col p-0", className)}>
      {visible.map((ev, i) => {
        const last = i === visible.length - 1;
        const text = timelineEventText(ev, ctx);
        const isAuto = ev.kind === "automation" || ev.kind === "attempt";
        const details = admin ? detailsOf(ev) : [];
        const detId = `ev-det-${ev.id}`;
        const isOpen = !!open[ev.id];

        return (
          <li key={ev.id} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3.5 pb-5">
            {!last ? (
              <span aria-hidden className="absolute top-8 bottom-1 left-[13px] w-0.5 rounded-[1px] bg-border" />
            ) : null}
            <Node ev={ev} />
            <div className="flex min-w-0 flex-col gap-1.5 pt-1">
              <p className="m-0 font-medium text-pretty">{text}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground tabular">
                <When ev={ev} nowMs={nowMs} />
                {ev.kind === "human" ? <PersonChip ev={ev} loan={loan} /> : null}
                {isAuto ? <AutomatedChip /> : null}
                <Chip ev={ev} admin={admin} />
                {details.length ? (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={detId}
                    onClick={() => setOpen((s) => ({ ...s, [ev.id]: !s[ev.id] }))}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground md:min-h-7"
                  >
                    Details
                    <ChevronDown
                      aria-hidden
                      className={cn("size-3.5 transition-transform duration-150", isOpen && "rotate-180")}
                    />
                  </button>
                ) : null}
              </div>
              {ev.kind === "attempt" && ev.outcome === "duplicate_ignored" ? (
                <p className="m-0 font-mono text-xs [overflow-wrap:anywhere] text-[var(--st-declined-text)]">
                  {ev.idempotencyKey}
                </p>
              ) : null}
              {isOpen && details.length ? (
                <dl id={detId} className="m-0 mt-0.5 flex flex-col rounded-md bg-muted py-1.5 pr-1.5 pl-3 text-xs">
                  {details.map((d) => (
                    <div key={d.label} className="grid grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-3">
                      <dt className="text-muted-foreground">{d.label}</dt>
                      <dd
                        title={d.truncate ? d.value : undefined}
                        className={cn(
                          "m-0 font-mono",
                          d.truncate ? "truncate" : "[overflow-wrap:anywhere]",
                          d.danger ? "text-danger" : "text-foreground",
                        )}
                      >
                        {d.value}
                      </dd>
                      <CopyButton value={d.value} what={d.what} />
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Node({ ev }: { ev: TimelineEventDTO }) {
  if (ev.kind === "human" || ev.kind === "derived") {
    const color =
      ev.kind === "derived"
        ? ev.type === "overdue"
          ? "bg-destructive"
          : "bg-foreground"
        : ev.type === "returned"
          ? "bg-success"
          : "bg-foreground";
    return (
      <span aria-hidden className="grid size-7 place-items-center">
        <span className={cn("size-3 rounded-full shadow-[0_0_0_3px_var(--card)]", color)} />
      </span>
    );
  }
  const tone = toneOf(ev);
  const Icon = ev.kind === "attempt" && ev.outcome === "duplicate_ignored" ? CopyX : Zap;
  return (
    <span aria-hidden className={cn("grid size-7 place-items-center rounded-full border", NODE_TONE[tone])}>
      <Icon className="size-3.5" />
    </span>
  );
}

function toneOf(ev: TimelineEventDTO): Tone {
  if (ev.kind === "automation") {
    if (ev.status === "failed") return "danger";
    if (ev.status === "retrying") return "warning";
    return "default";
  }
  if (ev.kind === "attempt") {
    if (ev.outcome === "duplicate_ignored") return "slate";
    if (ev.outcome === "failed") return ev.final ? "danger" : "warning";
  }
  return "default";
}

function When({ ev, nowMs }: { ev: TimelineEventDTO; nowMs?: number }) {
  if (ev.kind === "derived") return <DayDate date={ev.date} />;
  return <RelativeTime ms={ev.at} nowMs={nowMs} />;
}

function PersonChip({
  ev,
  loan,
}: {
  ev: Extract<TimelineEventDTO, { kind: "human" }>;
  loan: Pick<LoanRowDTO, "owner" | "borrower">;
}) {
  const role = timelineActorRole(ev);
  if (!role) return null;
  const person = role === "owner" ? loan.owner : loan.borrower;
  return (
    <span className="inline-flex h-[22px] items-center gap-[5px] rounded-full border border-border bg-card pr-2 pl-[3px] font-medium text-foreground">
      <PersonAvatar initials={person.initials} size="xs" />
      {role === "owner" ? "Owner" : "Borrower"}
    </span>
  );
}

function AutomatedChip() {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full border border-[var(--st-reported-border)] bg-[var(--st-reported-bg)] px-2 font-semibold text-[var(--st-reported-text)]">
      <Zap aria-hidden className="size-3" />
      Automated
    </span>
  );
}

function Chip({ ev, admin }: { ev: TimelineEventDTO; admin: boolean }) {
  if (ev.kind === "automation") {
    return (
      <DeliveryChip
        status={ev.status}
        audience={admin ? "admin" : "user"}
        attempts={ev.attempt}
        maxAttempts={ev.maxAttempts}
        errorCategory={admin ? ev.admin?.errorCategory : null}
      />
    );
  }
  if (ev.kind === "attempt") {
    let status: DeliveryChipStatus;
    switch (ev.outcome) {
      case "duplicate_ignored":
        status = "duplicate_ignored";
        break;
      case "failed":
        status = ev.final ? "failed" : "retrying";
        break;
      case "sent":
        status = "sent";
        break;
      default:
        status = "accepted";
    }
    return (
      <DeliveryChip
        status={status}
        audience="admin"
        attempts={ev.attempt}
        maxAttempts={ev.maxAttempts}
        errorCategory={ev.errorCategory}
      />
    );
  }
  return null;
}

function categoryRow(c: ErrorCategory | null): Detail[] {
  return c ? [{ label: "Error category", value: ERROR_CATEGORY_LABEL[c], what: "error category", danger: true }] : [];
}

function detailsOf(ev: TimelineEventDTO): Detail[] {
  if (ev.kind === "automation" && ev.admin) {
    const a = ev.admin;
    return [
      ...(a.executionId ? [{ label: "Execution ID", value: a.executionId, what: "execution ID" }] : []),
      { label: "Idempotency key", value: a.idempotencyKey, what: "idempotency key", truncate: true },
      ...(a.channel ? [{ label: "Channel", value: a.channel, what: "channel" }] : []),
      ...categoryRow(a.errorCategory),
    ];
  }
  if (ev.kind === "attempt") {
    return [
      ...(ev.executionId ? [{ label: "Execution ID", value: ev.executionId, what: "execution ID" }] : []),
      { label: "Idempotency key", value: ev.idempotencyKey, what: "idempotency key", truncate: true },
      ...categoryRow(ev.errorCategory),
    ];
  }
  return [];
}

/** Loading placeholder for the timeline (4 rows). */
export function ActivityTimelineSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading activity" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5 pb-5">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex flex-col gap-2 pt-1">
            <Skeleton className="h-3.5 w-3/5" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-[90px] rounded-full" />
              <Skeleton className="h-5 w-[70px] rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
