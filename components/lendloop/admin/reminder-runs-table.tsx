"use client";

import { CalendarClock, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { fmtClock, fmtDay } from "@/lib/domain/dates";
import { ERROR_CATEGORY_LABEL, parseIdempotencyKey } from "@/lib/domain/automation";
import type { DeliveryDTO, ReminderRunDTO } from "@/lib/domain/dto";
import { APP_TIME_ZONE } from "@/lib/config";
import { cn } from "@/lib/utils";
import { EmptyState } from "../empty-state";
import { fmtDuration, runStatusChip } from "./admin-copy";

type ProcessedLoan = {
  key: string;
  ref: string;
  toolName: string;
  text: string;
  tone: "success" | "warning" | "danger" | "slate";
};

const TONE_TEXT: Record<ProcessedLoan["tone"], string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  slate: "text-[var(--st-declined-text)]",
};

/**
 * Loans this run touched: the write-backs it made under its own execution id
 * (a same-day re-run that skipped a loan doesn't list it), labelled by what
 * happened in this run, not the delivery's current status.
 */
function processedLoans(run: ReminderRunDTO, deliveries: DeliveryDTO[]): ProcessedLoan[] {
  const out: ProcessedLoan[] = [];
  for (const d of deliveries) {
    const parsed = parseIdempotencyKey(d.idempotencyKey);
    if (parsed?.kind !== "reminder" || parsed.runDate !== run.runDate) continue;
    d.attemptHistory.forEach((a, i) => {
      if (a.executionId !== run.executionId) return;
      const base = { key: `${d._id}:${i}`, ref: d.loanRef, toolName: d.toolName };
      if (a.outcome === "sent") {
        out.push({ ...base, text: a.attempt > 1 ? `Sent · attempt ${a.attempt}` : "Sent", tone: "success" });
      } else if (a.outcome === "failed") {
        const err = a.errorCategory ? ` · ${ERROR_CATEGORY_LABEL[a.errorCategory]}` : "";
        out.push({ ...base, text: `Failed ${a.attempt}/${d.maxAttempts}${err}`, tone: "danger" });
      } else if (a.outcome === "duplicate_ignored") {
        out.push({ ...base, text: "Duplicate write-back ignored", tone: "slate" });
      }
    });
  }
  return out;
}

function RunChip({ run }: { run: ReminderRunDTO }) {
  const { label, tone } = runStatusChip(run);
  return (
    <Badge tone={tone} weight="semibold">
      {label}
    </Badge>
  );
}

function ProcessedList({
  id,
  items,
  className,
}: {
  id: string;
  items: ProcessedLoan[];
  className?: string;
}) {
  return (
    <ul
      id={id}
      aria-label="Loans processed"
      className={cn("m-0 flex list-none flex-col gap-1.5 rounded-md bg-muted px-3 py-2 text-[13px]", className)}
    >
      {items.length === 0 ? (
        <li className="text-muted-foreground">No reminder deliveries recorded for this run.</li>
      ) : (
        items.map((x) => (
          <li key={x.key} className="flex flex-wrap items-center gap-2">
            <Link href={`/loans/${x.ref}`} className="font-mono text-xs">
              {x.ref}
            </Link>
            <span>{x.toolName}</span>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <span className={cn("font-semibold", TONE_TEXT[x.tone])}>{x.text}</span>
          </li>
        ))
      )}
    </ul>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        "size-4 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
        open && "rotate-90",
      )}
    />
  );
}

export type ReminderRunsTableProps = {
  runs: ReminderRunDTO[];
  /** Recent deliveries, for the per-run loan breakdown. */
  deliveries: DeliveryDTO[];
};

/** Reminder runs tab: one row per daily run, expandable to the loans it processed. */
export function ReminderRunsTable({ runs, deliveries }: ReminderRunsTableProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No reminder runs yet."
        description="The daily overdue check writes each run here."
      />
    );
  }

  const num = (n: number, cls?: string) => <td className={cn("px-3 text-right tabular", cls)}>{n}</td>;

  return (
    <>
      <table
        aria-label="Reminder runs"
        className="hidden w-full border-separate border-spacing-0 overflow-hidden rounded-lg border border-border bg-card text-sm shadow-ll-card min-[1000px]:table"
      >
        <thead>
          <tr className="h-10 text-left text-xs font-semibold text-muted-foreground">
            <th scope="col" className="border-b border-border pl-4">
              Date
            </th>
            <th scope="col" className="border-b border-border px-3">
              Status
            </th>
            <th scope="col" className="w-14 border-b border-border px-3 text-right">
              Found
            </th>
            <th scope="col" className="w-14 border-b border-border px-3 text-right">
              Sent
            </th>
            <th scope="col" className="w-[136px] border-b border-border px-3 text-right">
              Duplicates ignored
            </th>
            <th scope="col" className="w-14 border-b border-border px-3 text-right">
              Failed
            </th>
            <th scope="col" className="w-[72px] border-b border-border px-3 text-right">
              Duration
            </th>
            <th scope="col" className="border-b border-border pr-4 pl-3">
              Execution
            </th>
          </tr>
        </thead>
        {runs.map((r, i) => {
          const isOpen = open.has(r._id);
          const panelId = `run-${r._id}-t`;
          const border = i > 0 ? "border-t border-border" : "";
          return (
            <tbody key={r._id}>
              <tr className="h-[52px]">
                <th scope="row" className={cn("pl-4 text-left font-normal", border)}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(r._id)}
                    className="-ml-1 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent pr-1.5 pl-0.5 font-semibold text-foreground hover:bg-muted"
                  >
                    <Chevron open={isOpen} />
                    {fmtDay(r.runDate)}
                    <span className="font-normal text-muted-foreground tabular">
                      {fmtClock(r.finishedAt, APP_TIME_ZONE)}
                    </span>
                  </button>
                </th>
                <td className={cn("px-3", border)}>
                  <RunChip run={r} />
                </td>
                {num(r.found, border)}
                {num(r.sent, border)}
                {num(
                  r.duplicates,
                  cn(border, r.duplicates ? "text-[var(--st-declined-text)]" : "text-muted-foreground"),
                )}
                {num(r.failed, cn(border, r.failed ? "font-semibold text-danger" : "text-muted-foreground"))}
                <td className={cn("px-3 text-right text-muted-foreground tabular", border)}>
                  {fmtDuration(r.durationMs)}
                </td>
                <td className={cn("pr-4 pl-3 font-mono text-xs", border)}>{r.executionId}</td>
              </tr>
              {isOpen ? (
                <tr>
                  <td colSpan={8} className="px-4 pb-3">
                    <ProcessedList id={panelId} items={processedLoans(r, deliveries)} />
                  </td>
                </tr>
              ) : null}
            </tbody>
          );
        })}
      </table>

      <ul
        aria-label="Reminder runs"
        className="m-0 list-none overflow-hidden rounded-lg border border-border bg-card p-0 shadow-ll-card min-[1000px]:hidden"
      >
        {runs.map((r, i) => {
          const isOpen = open.has(r._id);
          const panelId = `run-${r._id}-c`;
          return (
            <li key={r._id} className={cn("flex flex-col gap-1.5 px-3.5 py-3", i > 0 && "border-t border-border")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(r._id)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 pr-1.5 font-semibold text-foreground"
                >
                  <Chevron open={isOpen} />
                  {`${fmtDay(r.runDate)} · ${fmtClock(r.finishedAt, APP_TIME_ZONE)}`}
                </button>
                <RunChip run={r} />
              </div>
              <p className="m-0 text-[13px] text-muted-foreground tabular">
                {`${r.found} found · ${r.sent} sent · ${r.duplicates} duplicates ignored · `}
                <span className={r.failed ? "font-semibold text-danger" : undefined}>{`${r.failed} failed`}</span>
                {` · ${fmtDuration(r.durationMs)}`}
              </p>
              <p className="m-0 font-mono text-xs">{r.executionId}</p>
              {isOpen ? (
                <ProcessedList
                  id={panelId}
                  items={processedLoans(r, deliveries)}
                 
                  className="mt-1"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
