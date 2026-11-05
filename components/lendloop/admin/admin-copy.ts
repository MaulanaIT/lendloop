// Admin-only wording. Unlike the user-facing automation line (lib/copy.ts),
// admins see attempt counts, so failures read "Reminder failed (3/3)".

import { fmtWhen, type AutomationTone } from "@/lib/copy";
import { APP_TIME_ZONE } from "@/lib/config";
import type { N8nWorkflowId, NotificationEvent } from "@/lib/domain/automation";
import { fmtDay, todayISO } from "@/lib/domain/dates";
import type { AutomationLineDTO, ReminderRunDTO } from "@/lib/domain/dto";

/** Short event names for the deliveries table and drawer title. */
export const DELIVERY_EVENT_LABEL: Record<NotificationEvent | "duplicate", string> = {
  overdue_reminder: "Overdue reminder",
  requested: "New request",
  approved: "Request approved",
  declined: "Request declined",
  cancelled: "Loan cancelled",
  return_reported: "Return reported",
  returned: "Marked returned",
  duplicate: "Duplicate write-back",
};

const SENT_TEXT: Record<Exclude<NotificationEvent, "overdue_reminder" | "return_reported">, string> = {
  requested: "Owner notified",
  approved: "Approval sent to borrower",
  declined: "Decline notice sent",
  cancelled: "Cancellation notice sent",
  returned: "Return confirmation sent",
};

/** "Last automation event" cell in Admin · Loans. */
export function adminAutomationText(a: AutomationLineDTO, nowMs: number): { text: string; tone: AutomationTone } {
  const reminder = a.event === "overdue_reminder";
  const Who = a.recipientRole === "owner" ? "Owner" : "Borrower";
  const count = `(${a.attempts}/${a.maxAttempts})`;
  switch (a.status) {
    case "sent":
      if (a.event === "overdue_reminder") return { text: `Reminder sent ${fmtWhen(a.at, nowMs)}`, tone: "muted" };
      if (a.event === "return_reported") {
        return { text: `Return report sent to owner ${fmtWhen(a.at, nowMs)}`, tone: "muted" };
      }
      return { text: SENT_TEXT[a.event], tone: "muted" };
    case "failed":
      return {
        text: reminder ? `Reminder failed ${count}` : `${Who} notification failed ${count}`,
        tone: "danger",
      };
    case "retrying":
      return {
        text: reminder ? "Reminder retrying" : `${Who} notification retrying`,
        tone: "warning",
      };
    case "queued":
    case "accepted":
      return {
        text: reminder ? "Sending reminder…" : `Notifying ${Who.toLowerCase()}…`,
        tone: "muted",
      };
  }
}

/** "4.2s" */
export function fmtDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Reminder run status chip: "Completed", "Completed · 1 failed", "Failed". */
export function runStatusChip(run: Pick<ReminderRunDTO, "status" | "failed">): {
  label: string;
  tone: "success" | "warning" | "danger";
} {
  if (run.status === "failed") return { label: "Failed", tone: "danger" };
  if (run.failed > 0 || run.status === "completed_with_failures") {
    return { label: `Completed · ${run.failed} failed`, tone: "warning" };
  }
  return { label: "Completed", tone: "success" };
}

/** "09:00:04" (today) or "Nov 4, 17:40:02": attempt-history timestamps in the app timezone. */
export function fmtAttemptTime(ms: number, nowMs: number, timeZone: string = APP_TIME_ZONE): string {
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
  const day = todayISO(ms, timeZone);
  return day === todayISO(nowMs, timeZone) ? clock : `${fmtDay(day)}, ${clock}`;
}

/** "next retry in 30s" / "next retry in 2m" / "retrying now…" */
export function nextRetryText(nextRetryAt: number, nowMs: number): string {
  const s = Math.round((nextRetryAt - nowMs) / 1000);
  if (s <= 0) return "retrying now…";
  if (s < 90) return `next retry in ${s}s`;
  return `next retry in ${Math.round(s / 60)}m`;
}

/**
 * Deep link to an n8n execution. The base URL is admin-configured
 * (N8N_EDITOR_BASE_URL) but still only accepted as http(s), so a bad value
 * can't become a javascript: link. The workflow id comes from the server,
 * which knows whether a reminder ran in the daily run or via "Retry now".
 */
export function n8nExecutionUrl(
  base: string | null,
  workflowId: N8nWorkflowId | null,
  executionId: string | null,
): string | null {
  if (!base || !workflowId || !executionId) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const root = url.href.replace(/\/+$/, "");
    return `${root}/workflow/${encodeURIComponent(workflowId)}/executions/${encodeURIComponent(executionId)}`;
  } catch {
    return null;
  }
}
