// Contract between Convex and n8n. The n8n workflows in /n8n/workflows mirror
// these names; docs/integration.md describes the wire format.

import type { ISODate } from "./dates";
import { isOverdue, type StoredLoanStatus } from "./status";

export const NOTIFICATION_EVENTS = [
  "requested",
  "approved",
  "declined",
  "cancelled",
  "return_reported",
  "returned",
  "overdue_reminder",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export type RecipientRole = "owner" | "borrower";

export const DELIVERY_STATUSES = ["queued", "accepted", "sent", "retrying", "failed"] as const;
/**
 * queued    – written by the mutation, the send action is scheduled
 * accepted  – n8n acknowledged the signed webhook (202) and is delivering
 * sent      – n8n wrote back a successful delivery
 * retrying  – a send attempt failed; another one is scheduled
 * failed    – out of attempts (or n8n's error path reported a final failure)
 */
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const ERROR_CATEGORIES = [
  "timeout",
  "upstream_5xx",
  "upstream_4xx",
  "network",
  "signature_rejected",
  "not_configured",
  "delivery_failed",
  // Convex-only: the loan moved on before the send, so nothing was sent on
  // purpose. Not a failure: never counted in failed24h, never retried.
  "superseded",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const ERROR_CATEGORY_LABEL: Record<ErrorCategory, string> = {
  timeout: "timeout",
  upstream_5xx: "upstream 5xx",
  upstream_4xx: "upstream 4xx",
  network: "network",
  signature_rejected: "signature rejected",
  not_configured: "not configured",
  delivery_failed: "delivery failed",
  superseded: "superseded",
};

export const MAX_ATTEMPTS = 3;
/** Backoff before attempt 2 and attempt 3 (ms). */
export const RETRY_BACKOFF_MS = [30_000, 120_000] as const;

/** Idempotency keys: one notification per loan event, one reminder per loan per day. */
export function notificationKey(loanRef: string, event: Exclude<NotificationEvent, "overdue_reminder">): string {
  return `notify:${loanRef}:${event}`;
}

export function reminderKey(loanRef: string, runDate: string): string {
  return `reminder:${loanRef}:${runDate}`;
}

const KEY_RE = /^(notify:(L-\d+):([a-z_]+)|reminder:(L-\d+):(\d{4}-\d{2}-\d{2}))$/;

export function parseIdempotencyKey(
  key: string,
): { kind: "notification"; loanRef: string; event: NotificationEvent } | { kind: "reminder"; loanRef: string; runDate: string } | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  if (m[2]) {
    const event = m[3] as NotificationEvent;
    if (!(NOTIFICATION_EVENTS as readonly string[]).includes(event) || event === "overdue_reminder") return null;
    return { kind: "notification", loanRef: m[2], event };
  }
  return { kind: "reminder", loanRef: m[4], runDate: m[5] };
}

type ResendLoan = { status: StoredLoanStatus; startDate: ISODate; endDate: ISODate; returnReportedAt?: number | null };

/**
 * Whether a delivery may still go out (first send, automatic retry or admin
 * "Retry now"). A request that was since cancelled, or a reminder for another
 * day, would reach the recipient late and out of order, so it is dropped.
 * Declined, cancelled and returned are final states and always current.
 */
export function resendCheck(
  d: { kind: "notification" | "reminder"; event: NotificationEvent; idempotencyKey: string },
  loan: ResendLoan | null,
  today: ISODate,
): { ok: true } | { ok: false; reason: string } {
  if (!loan) return { ok: false, reason: "This loan no longer exists." };
  if (d.kind === "reminder") {
    if (!isOverdue(loan, today)) return { ok: false, reason: "This loan is no longer overdue, so there's nothing to remind." };
    const parsed = parseIdempotencyKey(d.idempotencyKey);
    // One reminder per loan per day: an older day's reminder is replaced by today's run.
    if (parsed?.kind !== "reminder" || parsed.runDate !== today) {
      return { ok: false, reason: "Today's reminder run replaces this one." };
    }
    return { ok: true };
  }
  const current =
    d.event === "requested"
      ? loan.status === "pending"
      : d.event === "approved"
        ? loan.status === "approved"
        : d.event === "return_reported"
          ? loan.status === "approved" && !!loan.returnReportedAt
          : true;
  return current ? { ok: true } : { ok: false, reason: "This request has changed since; there's nothing to resend." };
}

/**
 * Data minimization: the only fields that ever leave Convex for n8n.
 * Shown verbatim (names only) in the admin delivery drawer.
 */
export const FIELDS_SENT = [
  "event",
  "loanId",
  "toolName",
  "startDate",
  "endDate",
  "recipientRole",
  "recipientFirstName",
  "recipientEmail",
] as const;

export const FIELDS_NOT_SENT_NOTE =
  "Not sent: description, condition, the other party's email, user IDs. Values are not stored in this log.";

export type NotificationPayload = {
  idempotencyKey: string;
  attempt: number;
  event: NotificationEvent;
  loanId: string; // human reference, e.g. "L-1042"
  toolName: string;
  startDate: string;
  endDate: string;
  recipientRole: RecipientRole;
  recipientFirstName: string;
  recipientEmail: string;
};

/**
 * Ids of the workflows in n8n/workflows/*.json, used for execution deep links
 * (<N8N_EDITOR_BASE_URL>/workflow/<id>/executions/<executionId>).
 */
export const N8N_WORKFLOW_IDS = {
  requestNotifications: "lendloopReqNotif",
  overdueReminders: "lendloopOverdueR",
  errorHandler: "lendloopErrorHdl",
} as const;
export type N8nWorkflowId = (typeof N8N_WORKFLOW_IDS)[keyof typeof N8N_WORKFLOW_IDS];

/** Environment variables whose presence (never value) the admin page reports. */
export const CONFIG_KEYS = ["N8N_REQUEST_WEBHOOK_URL", "N8N_WEBHOOK_SECRET", "CONVEX_INBOUND_SECRET"] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];
