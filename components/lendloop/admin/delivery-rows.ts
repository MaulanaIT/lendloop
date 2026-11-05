// Row model for the admin deliveries table. A duplicate write-back is stored
// as an attempt on its delivery (it changed nothing), but admins see it as its
// own slate row, as in the design.

import type { DeliveryStatus, ErrorCategory, N8nWorkflowId, NotificationEvent } from "@/lib/domain/automation";
import type { DeliveryDTO } from "@/lib/domain/dto";

export type DeliveryRow =
  | { kind: "delivery"; id: string; delivery: DeliveryDTO; at: number }
  | {
      kind: "duplicate";
      id: string;
      delivery: DeliveryDTO;
      at: number;
      executionId: string | null;
      workflowId: N8nWorkflowId | null;
      errorCategory: ErrorCategory | null;
    };

export type DeliveryStatusFilter = Extract<DeliveryStatus, "failed" | "retrying" | "sent"> | "duplicate" | "all";
export type DeliveryEventFilter = NotificationEvent | "duplicate" | "all";

const ATTENTION: Record<DeliveryStatus, number> = {
  failed: 0,
  retrying: 1,
  queued: 2,
  accepted: 2,
  sent: 2,
};

/** Time shown for a delivery: when it was delivered, otherwise when it was first sent. */
function shownAt(d: DeliveryDTO): number {
  return d.status === "sent" ? d.updatedAt : d.createdAt;
}

/**
 * Failed first, then retrying, then the rest newest first; each delivery's
 * ignored duplicate write-backs follow it directly.
 */
export function buildDeliveryRows(deliveries: DeliveryDTO[]): DeliveryRow[] {
  const sorted = [...deliveries].sort((a, b) => ATTENTION[a.status] - ATTENTION[b.status] || shownAt(b) - shownAt(a));
  const rows: DeliveryRow[] = [];
  for (const d of sorted) {
    rows.push({ kind: "delivery", id: d._id, delivery: d, at: shownAt(d) });
    d.attemptHistory.forEach((a, i) => {
      if (a.outcome !== "duplicate_ignored") return;
      rows.push({
        kind: "duplicate",
        id: `${d._id}:dup:${i}`,
        delivery: d,
        at: a.at,
        executionId: a.executionId,
        workflowId: a.workflowId,
        errorCategory: a.errorCategory,
      });
    });
  }
  return rows;
}

export function filterDeliveryRows(
  rows: DeliveryRow[],
  status: DeliveryStatusFilter,
  event: DeliveryEventFilter,
): DeliveryRow[] {
  return rows.filter((r) => {
    const dup = r.kind === "duplicate";
    const statusOk = status === "all" || (status === "duplicate" ? dup : !dup && r.delivery.status === status);
    const eventOk = event === "all" || (event === "duplicate" ? dup : !dup && r.delivery.event === event);
    return statusOk && eventOk;
  });
}

/** Executions shown for a row: the duplicate's own write-back, else the delivery's latest. */
export function rowExecutionId(r: DeliveryRow): string | null {
  return r.kind === "duplicate" ? r.executionId : r.delivery.executionId;
}

/** The n8n workflow that ran `rowExecutionId(r)`, for the editor link. */
export function rowExecutionWorkflowId(r: DeliveryRow): N8nWorkflowId | null {
  return r.kind === "duplicate" ? r.workflowId : r.delivery.executionWorkflowId;
}
