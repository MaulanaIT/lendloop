"use client";

import { ExternalLink, RotateCw } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ERROR_CATEGORY_LABEL, FIELDS_NOT_SENT_NOTE, type ErrorCategory } from "@/lib/domain/automation";
import type { DeliveryDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";
import { CopyButton } from "../copy-button";
import { DELIVERY_EVENT_LABEL, fmtAttemptTime, n8nExecutionUrl, nextRetryText } from "./admin-copy";
import { RowChip, SignedChip } from "./deliveries-table";
import { rowExecutionId, rowExecutionWorkflowId, type DeliveryRow } from "./delivery-rows";

type HistoryItem = {
  key: string;
  time: string;
  outcome: "Delivered" | "Failed" | "Accepted" | "Scheduled" | "Ignored";
  error: string | null;
};

const OUTCOME_CLASS: Record<HistoryItem["outcome"], string> = {
  Delivered: "text-success",
  Failed: "text-danger",
  Accepted: "text-foreground",
  Scheduled: "text-warning",
  Ignored: "text-[var(--st-declined-text)]",
};

const OUTCOME_LABEL = {
  sent: "Delivered",
  failed: "Failed",
  accepted: "Accepted",
  duplicate_ignored: "Ignored",
} as const;

const errLabel = (e: ErrorCategory | null) => (e ? ERROR_CATEGORY_LABEL[e] : null);

function historyOf(row: DeliveryRow, nowMs: number): HistoryItem[] {
  if (row.kind === "duplicate") {
    return [
      {
        key: row.id,
        time: fmtAttemptTime(row.at, nowMs),
        outcome: "Ignored",
        error: "duplicate key",
      },
    ];
  }
  const d = row.delivery;
  // Duplicate write-backs are listed as their own rows in the table, not as attempts.
  const items: HistoryItem[] = d.attemptHistory
    .filter((a) => a.outcome !== "duplicate_ignored")
    .map((a, i) => ({
      key: `${i}`,
      time: fmtAttemptTime(a.at, nowMs),
      outcome: OUTCOME_LABEL[a.outcome],
      error: errLabel(a.errorCategory),
    }));
  if (d.status === "retrying" && d.nextRetryAt) {
    items.push({
      key: "next",
      time: nextRetryText(d.nextRetryAt, nowMs).replace("next retry ", ""),
      outcome: "Scheduled",
      error: null,
    });
  }
  return items;
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 flex min-w-0 items-center gap-0.5">{children}</dd>
    </>
  );
}

export type DeliveryDetailDrawerProps = {
  row: DeliveryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolName: string | null;
  /** N8N_EDITOR_BASE_URL (not a secret); null hides the deep link. */
  n8nBaseUrl: string | null;
  nowMs: number;
  onRetry: (delivery: DeliveryDTO) => void;
  retrying: ReadonlySet<string>;
  blockedReason?: string | null;
};

/**
 * Right-hand drawer with one delivery's technical detail (brief A6/B13).
 * Data minimization: it shows field NAMES that were sent, never values, and
 * never the payload, webhook URL, signature or secrets.
 */
export function DeliveryDetailDrawer({
  row,
  open,
  onOpenChange,
  toolName,
  n8nBaseUrl,
  nowMs,
  onRetry,
  retrying,
  blockedReason,
}: DeliveryDetailDrawerProps) {
  const helpId = useId();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" aria-describedby={undefined}>
        {row ? (
          <DrawerBody
            row={row}
            toolName={toolName}
            n8nBaseUrl={n8nBaseUrl}
            nowMs={nowMs}
            onRetry={onRetry}
            retrying={retrying}
            blockedReason={blockedReason}
            helpId={helpId}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  row,
  toolName,
  n8nBaseUrl,
  nowMs,
  onRetry,
  retrying,
  blockedReason,
  helpId,
}: Omit<DeliveryDetailDrawerProps, "open" | "onOpenChange" | "row"> & {
  row: DeliveryRow;
  helpId: string;
}) {
  const d = row.delivery;
  const dup = row.kind === "duplicate";
  const exec = rowExecutionId(row);
  const n8nUrl = n8nExecutionUrl(n8nBaseUrl, rowExecutionWorkflowId(row), exec);
  const history = historyOf(row, nowMs);
  const failed = !dup && d.status === "failed";
  const busy = retrying.has(d._id);

  return (
    <>
      <SheetHeader closeLabel="Close details">
        <SheetTitle>{dup ? DELIVERY_EVENT_LABEL.duplicate : DELIVERY_EVENT_LABEL[d.event]}</SheetTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <RowChip row={row} />
          {!dup && d.signed ? <SignedChip size="md" /> : null}
        </div>
      </SheetHeader>
      <SheetBody>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <MetaRow label="Loan">
            <span>
              <Link href={`/loans/${d.loanRef}`} className="font-mono text-[13px]">
                {d.loanRef}
              </Link>
              {toolName ? <span className="text-muted-foreground">{` · ${toolName}`}</span> : null}
            </span>
          </MetaRow>
          <MetaRow label="Recipient">{dup ? "Convex (inbound write-back)" : `to ${d.recipientRole}`}</MetaRow>
          {!dup && d.channel ? <MetaRow label="Channel">{d.channel}</MetaRow> : null}
          <MetaRow label="Execution ID">
            <span className="font-mono text-[13px]">{exec ?? "—"}</span>
            {exec ? <CopyButton value={exec} what="execution ID" className="md:size-8" /> : null}
          </MetaRow>
          <MetaRow label="Idempotency key">
            <span className="min-w-0 font-mono text-[13px] [overflow-wrap:anywhere]">{d.idempotencyKey}</span>
            <CopyButton value={d.idempotencyKey} what="idempotency key" className="md:size-8" />
          </MetaRow>
        </dl>

        <section aria-labelledby={`${helpId}-att`} className="flex flex-col gap-2">
          <h3 id={`${helpId}-att`} className="m-0 text-sm font-semibold">
            Attempt history
          </h3>
          {history.length === 0 ? (
            <p className="m-0 text-[13px] text-muted-foreground">No attempts yet. It&apos;s queued to send.</p>
          ) : (
            <ol className="m-0 list-none overflow-hidden rounded-md border border-border p-0">
              {history.map((h, i) => (
                <li
                  key={h.key}
                  className={cn(
                    "grid min-h-10 grid-cols-[24px_minmax(76px,auto)_minmax(0,1fr)_auto] items-center gap-2 px-3 text-[13px] tabular",
                    i > 0 && "border-t border-border",
                  )}
                >
                  <span className="text-muted-foreground">{`#${i + 1}`}</span>
                  <span className="font-mono text-xs text-muted-foreground">{h.time}</span>
                  <span className={cn("font-semibold", OUTCOME_CLASS[h.outcome])}>{h.outcome}</span>
                  <span className={h.error ? "text-foreground" : "text-muted-foreground"}>{h.error ?? "—"}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {dup ? (
          <p className="m-0 rounded-md border border-[var(--st-declined-border)] bg-[var(--st-declined-bg)] px-3 py-2.5 text-[13px] text-pretty text-[var(--st-declined-text)]">
            The write-back matched an existing record by idempotency key, so nothing was written. Not counted as a
            delivery.
          </p>
        ) : (
          <section aria-labelledby={`${helpId}-fields`} className="flex flex-col gap-2">
            <h3 id={`${helpId}-fields`} className="m-0 text-sm font-semibold">
              Fields sent
            </h3>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {d.fieldsSent.map((name) => (
                <li
                  key={name}
                  className="inline-flex h-6 items-center rounded-sm border border-border bg-muted px-2 font-mono text-xs"
                >
                  {name}
                </li>
              ))}
            </ul>
            <p className="m-0 text-[13px] text-pretty text-muted-foreground">{FIELDS_NOT_SENT_NOTE}</p>
          </section>
        )}

        {n8nUrl ? (
          <a
            href={n8nUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 self-start font-semibold md:min-h-10"
          >
            {`Open execution ${exec} in n8n`}
            <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null}

        {failed ? (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <Button
              className="self-start pr-4 pl-3.5"
              aria-describedby={helpId}
              loading={busy}
              loadingLabel="Retrying…"
              disabledReason={!d.canRetry ? (d.retryBlockedReason ?? "Nothing to retry.") : blockedReason}
              onClick={() => onRetry(d)}
            >
              <RotateCw aria-hidden />
              Retry now
            </Button>
            <p id={helpId} className="m-0 text-[13px] text-pretty text-muted-foreground">
              Reuses idempotency key <span className="font-mono text-xs text-foreground">{d.idempotencyKey}</span>, so
              the write-back can&apos;t create a duplicate record.
            </p>
          </div>
        ) : null}
      </SheetBody>
    </>
  );
}
