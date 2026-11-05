"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fmtAbsolute, fmtWhen } from "@/lib/copy";
import { ERROR_CATEGORY_LABEL } from "@/lib/domain/automation";
import { isoDateTime } from "@/lib/domain/dates";
import type { DeliveryDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";
import { CopyButton } from "../copy-button";
import { DeliveryChip } from "../delivery-chip";
import { useNow } from "../use-now";
import { DELIVERY_EVENT_LABEL, nextRetryText } from "./admin-copy";
import { AdminTable, StackedFields, type AdminColumn } from "./admin-table";
import { rowExecutionId, type DeliveryRow } from "./delivery-rows";

/** Why "Retry now" is unavailable for a failed delivery (mirrors admin.retryDelivery). */

/** "Signed ✓": the outbound webhook carried an HMAC signature. */
export function SignedChip({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span
      title="Outbound request signed with HMAC"
      className={cn(
        "inline-flex shrink-0 items-center gap-[3px] rounded-full border border-border bg-muted font-semibold text-muted-foreground",
        size === "md" ? "h-[22px] px-2 text-xs" : "h-[18px] px-1.5 text-[11px]",
      )}
    >
      Signed
      <Check aria-hidden className={size === "md" ? "size-3" : "size-[11px]"} />
    </span>
  );
}

export function DeliveryTime({ ms, nowMs }: { ms: number; nowMs: number }) {
  return (
    <time dateTime={isoDateTime(ms)} title={fmtAbsolute(ms)} className="tabular">
      {fmtWhen(ms, nowMs)}
    </time>
  );
}

/** Ticks every second so the countdown stays honest. */
export function NextRetry({ at, className }: { at: number; className?: string }) {
  const now = useNow(1000);
  return <span className={cn("text-warning", className)}>{nextRetryText(at, now)}</span>;
}

export function RowChip({ row }: { row: DeliveryRow }) {
  if (row.kind === "duplicate") return <DeliveryChip status="duplicate_ignored" audience="admin" />;
  const d = row.delivery;
  return <DeliveryChip status={d.status} audience="admin" attempts={d.attempts} maxAttempts={d.maxAttempts} />;
}

function attemptsText(row: DeliveryRow): string {
  if (row.kind === "duplicate") return "—";
  const d = row.delivery;
  return d.status === "failed" || d.status === "retrying" ? `${d.attempts}/${d.maxAttempts}` : String(d.attempts);
}

function errorOf(row: DeliveryRow) {
  return row.kind === "duplicate" ? null : row.delivery.errorCategory;
}

function errorLabel(row: DeliveryRow) {
  const err = errorOf(row);
  return err ? ERROR_CATEGORY_LABEL[err] : "—";
}

function errorClass(row: DeliveryRow) {
  const err = errorOf(row);
  if (!err) return "text-muted-foreground";
  return cn("font-semibold", row.delivery.status === "failed" ? "text-danger" : "text-warning");
}

function recipientText(row: DeliveryRow) {
  return row.kind === "duplicate" ? "—" : `to ${row.delivery.recipientRole}`;
}

function eventLabel(row: DeliveryRow) {
  return row.kind === "duplicate" ? DELIVERY_EVENT_LABEL.duplicate : DELIVERY_EVENT_LABEL[row.delivery.event];
}

function isFailed(row: DeliveryRow) {
  return row.kind === "delivery" && row.delivery.status === "failed";
}

export type DeliveriesTableProps = {
  rows: DeliveryRow[];
  nowMs: number;
  onView: (row: DeliveryRow) => void;
  onRetry: (delivery: DeliveryDTO) => void;
  /** Deliveries with a retryDelivery call in flight. */
  retrying: ReadonlySet<string>;
  /** Blocks Retry now (e.g. offline). */
  blockedReason?: string | null;
};

function RetryButton({
  row,
  onRetry,
  retrying,
  blockedReason,
  className,
}: Pick<DeliveriesTableProps, "onRetry" | "retrying" | "blockedReason"> & {
  row: DeliveryRow;
  className?: string;
}) {
  if (!isFailed(row)) return null;
  const d = row.delivery;
  const busy = retrying.has(d._id);
  return (
    <Button
      size="sm"
      className={className}
      loading={busy}
      loadingLabel="Retrying…"
      disabledReason={!d.canRetry ? (d.retryBlockedReason ?? "Nothing to retry.") : blockedReason}
      onClick={() => onRetry(d)}
    >
      Retry now
    </Button>
  );
}

function KeyCell({ value, wide = false }: { value: string; wide?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <span title={value} className={cn("min-w-0 truncate font-mono text-xs", wide ? "flex-1" : "max-w-[160px]")}>
        {value}
      </span>
      <CopyButton value={value} what="idempotency key" className={wide ? "-my-3 -mr-2.5" : undefined} />
    </span>
  );
}

/** Deliveries tab (brief B13): table from 1180px, stacked cards below. */
export function DeliveriesTable({ rows, nowMs, onView, onRetry, retrying, blockedReason }: DeliveriesTableProps) {
  const columns: AdminColumn<DeliveryRow>[] = [
    {
      key: "time",
      header: "Time",
      className: "w-[92px]",
      // Failed rows get the red left bar (an inset shadow keeps the table borders intact).
      cellClassName: (r) =>
        cn("whitespace-nowrap text-muted-foreground", isFailed(r) && "shadow-[inset_3px_0_0_var(--destructive)]"),
      cell: (r) => <DeliveryTime ms={r.at} nowMs={nowMs} />,
    },
    {
      key: "event",
      header: "Event",
      cell: (r) => (
        <span className="flex flex-col items-start gap-[3px]">
          <span className="font-medium text-foreground">{eventLabel(r)}</span>
          {r.kind === "delivery" && r.delivery.signed ? <SignedChip /> : null}
        </span>
      ),
    },
    {
      key: "loan",
      header: "Loan",
      className: "w-16",
      cell: (r) => (
        <Link href={`/loans/${r.delivery.loanRef}`} className="font-mono text-xs">
          {r.delivery.loanRef}
        </Link>
      ),
    },
    {
      key: "to",
      header: "Recipient",
      className: "w-[90px]",
      cellClassName: "text-muted-foreground",
      cell: recipientText,
    },
    {
      key: "status",
      header: "Status",
      className: "w-32",
      cell: (r) => (
        <span className="flex flex-col items-start gap-[3px]">
          <RowChip row={r} />
          {r.kind === "delivery" && r.delivery.status === "retrying" && r.delivery.nextRetryAt ? (
            <NextRetry at={r.delivery.nextRetryAt} className="text-[11px]" />
          ) : null}
        </span>
      ),
    },
    {
      key: "attempts",
      header: "Attempts",
      align: "right",
      className: "w-[66px]",
      cell: attemptsText,
    },
    {
      key: "error",
      header: "Error category",
      className: "w-[104px]",
      cellClassName: errorClass,
      cell: errorLabel,
    },
    {
      key: "exec",
      header: "Execution ID",
      className: "w-24",
      cellClassName: "font-mono text-xs",
      cell: (r) => rowExecutionId(r) ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "key",
      header: "Idempotency key",
      className: "w-[200px]",
      cell: (r) => <KeyCell value={r.delivery.idempotencyKey} />,
    },
    {
      key: "actions",
      header: "Actions",
      srOnlyHeader: true,
      className: "w-[170px]",
      cell: (r) => (
        <span className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" className="md:h-8 md:px-2.5" onClick={() => onView(r)}>
            View
          </Button>
          <RetryButton
            row={r}
            onRetry={onRetry}
            retrying={retrying}
            blockedReason={blockedReason}
            className="md:h-8 md:px-2.5"
          />
        </span>
      ),
    },
  ];

  return (
    <AdminTable
      label="Deliveries"
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      breakpoint={1180}
      rowHeight={52}
      density="sm"
      textSize="xs"
      rowClassName={(r) => (r.kind === "duplicate" ? "bg-[var(--st-declined-bg)]" : undefined)}
      renderCard={(r) => (
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3.5 shadow-ll-card",
            r.kind === "duplicate" ? "bg-[var(--st-declined-bg)]" : "bg-card",
            isFailed(r) && "border-l-[3px] border-l-destructive",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="flex flex-col items-start gap-[3px]">
              <span className="font-semibold">{eventLabel(r)}</span>
              {r.kind === "delivery" && r.delivery.signed ? <SignedChip /> : null}
            </span>
            <RowChip row={r} />
          </div>
          <StackedFields
            items={[
              {
                label: "Time",
                value: <DeliveryTime ms={r.at} nowMs={nowMs} />,
              },
              {
                label: "Loan",
                value: (
                  <Link href={`/loans/${r.delivery.loanRef}`} className="font-mono text-xs">
                    {r.delivery.loanRef}
                  </Link>
                ),
              },
              { label: "Recipient", value: recipientText(r) },
              {
                label: "Attempts",
                value: (
                  <>
                    {attemptsText(r)}
                    {r.kind === "delivery" && r.delivery.status === "retrying" && r.delivery.nextRetryAt ? (
                      <>
                        {" · "}
                        <NextRetry at={r.delivery.nextRetryAt} />
                      </>
                    ) : null}
                  </>
                ),
              },
              {
                label: "Error",
                value: errorLabel(r),
                className: errorClass(r),
              },
              {
                label: "Execution",
                value: rowExecutionId(r) ?? "—",
                className: "font-mono text-xs",
              },
              {
                label: "Key",
                value: <KeyCell value={r.delivery.idempotencyKey} wide />,
              },
            ]}
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onView(r)}>
              View
            </Button>
            {isFailed(r) ? (
              <RetryButton
                row={r}
                onRetry={onRetry}
                retrying={retrying}
                blockedReason={blockedReason}
                className="flex-1"
              />
            ) : null}
          </div>
        </div>
      )}
    />
  );
}
