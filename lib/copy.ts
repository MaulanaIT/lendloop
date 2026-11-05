// Shared user-facing strings (brief A6 / A9). Screens build automation lines,
// timeline rows, status badges and dialog copy from here so the wording stays
// identical everywhere. Pure functions over DTO pieces: no React, no Convex.

import { APP_TIME_ZONE } from "./config";
import { MAX_ATTEMPTS, type DeliveryStatus, type NotificationEvent, type RecipientRole } from "./domain/automation";
import { SYSTEM_DECLINE_REASON } from "./domain/categories";
import { addDays, fmtClock, fmtDay, fmtRangeShort, todayISO, toUTC, type ISODate } from "./domain/dates";
import type { AdminListingDTO, AutomationLineDTO, LoanRowDTO, TimelineEventDTO } from "./domain/dto";
import { loanStatusLabel } from "./domain/status";

// ─── Small formatters ─────────────────────────────────────────────────────

/** "Maya L." → "Maya" */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "s" when n ≠ 1. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Thu, Nov 5, 2026 · 09:02": the absolute time behind every relative label (tooltips, <time title>). */
export function fmtAbsolute(ms: number, timeZone: string = APP_TIME_ZONE): string {
  const day = todayISO(ms, timeZone);
  const d = new Date(toUTC(day));
  return `${WEEKDAYS[d.getUTCDay()]}, ${fmtDay(day)}, ${d.getUTCFullYear()} · ${fmtClock(ms, timeZone)}`;
}

/** "today 09:02", "yesterday 09:00", otherwise "Nov 4, 09:00". Day-anchored, for automation lines. */
export function fmtWhen(ms: number, nowMs: number, timeZone: string = APP_TIME_ZONE): string {
  const today = todayISO(nowMs, timeZone);
  const day = todayISO(ms, timeZone);
  const clock = fmtClock(ms, timeZone);
  if (day === today) return `today ${clock}`;
  if (day === addDays(today, -1)) return `yesterday ${clock}`;
  return `${fmtDay(day)}, ${clock}`;
}

/** "Oct 31 → Nov 3" */
export function fmtArrowRange(start: ISODate, end: ISODate): string {
  return `${fmtDay(start)} → ${fmtDay(end)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Loan status badge text ───────────────────────────────────────────────

/** "by you" / "by borrower" / "listing removed" / "listing deleted". */
export function cancelledByText(
  cancelledBy: LoanRowDTO["cancelledBy"],
  viewerRole: LoanRowDTO["viewerRole"],
): string | null {
  switch (cancelledBy) {
    case "borrower":
      return viewerRole === "borrower" ? "by you" : "by borrower";
    case "listing_removed":
      return "listing removed";
    case "listing_deleted":
      return "listing deleted";
    default:
      return null;
  }
}

/**
 * Badge label for a loan row: "Approved · starts Nov 8", "On loan · due Nov 6",
 * "Due today", "Overdue · 2 days", "Returned Oct 20", "Declined · Dates taken",
 * "Cancelled · by borrower". Pass `withReason: false` where the owner's decline
 * reason is rendered as its own quoted chip (My requests).
 */
export function loanBadgeLabel(
  loan: Pick<
    LoanRowDTO,
    "storedStatus" | "status" | "startDate" | "endDate" | "returnedOn" | "declineReason" | "declineKind" | "cancelledBy" | "viewerRole"
  >,
  today: ISODate,
  opts: { withReason?: boolean } = {},
): string {
  const { withReason = true } = opts;
  if (loan.status === "declined") {
    if (loan.declineKind === "system") return `Declined · ${loan.declineReason ?? SYSTEM_DECLINE_REASON}`;
    return withReason && loan.declineReason ? `Declined · ${loan.declineReason}` : "Declined";
  }
  if (loan.status === "cancelled") {
    const by = cancelledByText(loan.cancelledBy, loan.viewerRole);
    return by ? `Cancelled · ${by}` : "Cancelled";
  }
  return loanStatusLabel(
    { status: loan.storedStatus, startDate: loan.startDate, endDate: loan.endDate, returnedOn: loan.returnedOn },
    today,
  );
}

// ─── Automation (n8n) copy ────────────────────────────────────────────────

type EventCopy = {
  /** Delivered: "Owner notified of new request". */
  sent: string;
  /** Queued / accepted / retrying: "Notifying owner of new request". */
  pending: string;
  /** Out of attempts: "Owner notification failed: new request". */
  failed: string;
  /** Admin attempt rows: "Overdue reminder attempt 1 failed". */
  noun: string;
};

const ROLE_WORD: Record<RecipientRole, string> = { owner: "owner", borrower: "borrower" };

function eventCopy(event: NotificationEvent, to: RecipientRole): EventCopy {
  const who = ROLE_WORD[to];
  const Who = capitalize(who);
  switch (event) {
    case "requested":
      return {
        sent: "Owner notified of new request",
        pending: "Notifying owner of new request",
        failed: "Owner notification failed: new request",
        noun: "New-request notification",
      };
    case "approved":
      return {
        sent: "Borrower notified: approved",
        pending: "Notifying borrower: approved",
        failed: "Borrower notification failed: approved",
        noun: "Approval notification",
      };
    case "declined":
      return {
        sent: "Borrower notified: declined",
        pending: "Notifying borrower: declined",
        failed: "Borrower notification failed: declined",
        noun: "Decline notification",
      };
    case "cancelled":
      return {
        sent: `${Who} notified: cancelled`,
        pending: `Notifying ${who}: cancelled`,
        failed: `${Who} notification failed: cancelled`,
        noun: "Cancellation notification",
      };
    case "return_reported":
      return {
        sent: "Owner notified: borrower reported return",
        pending: "Notifying owner: borrower reported return",
        failed: "Owner notification failed: borrower reported return",
        noun: "Return-reported notification",
      };
    case "returned":
      return {
        sent: "Borrower notified: returned",
        pending: "Notifying borrower: returned",
        failed: "Borrower notification failed: returned",
        noun: "Return notification",
      };
    case "overdue_reminder":
      return {
        sent: "Overdue reminder sent to borrower",
        pending: "Sending overdue reminder to borrower",
        failed: "Overdue reminder to borrower failed",
        noun: "Overdue reminder",
      };
  }
}

/** One line per notification, worded for its latest status. */
export function automationEventText(event: NotificationEvent, recipientRole: RecipientRole, status: DeliveryStatus): string {
  const c = eventCopy(event, recipientRole);
  if (status === "sent") return c.sent;
  if (status === "failed") return c.failed;
  return c.pending;
}

/** Admin-only attempt rows: "Overdue reminder attempt 1 failed", "Duplicate write-back ignored". */
export function attemptEventText(
  event: NotificationEvent,
  outcome: "accepted" | "sent" | "failed" | "duplicate_ignored",
  attempt: number,
): string {
  if (outcome === "duplicate_ignored") return "Duplicate write-back ignored";
  const noun = eventCopy(event, "borrower").noun;
  if (outcome === "failed") return `${noun} attempt ${attempt} failed`;
  if (outcome === "sent") return `${noun} attempt ${attempt} delivered`;
  return `${noun} attempt ${attempt} accepted by n8n`;
}

export type AutomationTone = "muted" | "warning" | "danger";

/**
 * The muted "⚡" line under a loan row (brief A6/A9). Users never see attempt
 * counts or error categories here; those stay in the admin views.
 *   sent      → "Owner notified" + check / "Reminder sent today 09:02"
 *   queued    → "Notifying owner…"
 *   retrying  → "Notification delayed — retrying automatically"
 *   failed    → "Notification failed — LendLoop is on it"
 * `check` asks the renderer for a trailing success check icon ("Owner notified ✓").
 */
export function automationLineText(
  a: AutomationLineDTO,
  nowMs: number,
): { text: string; tone: AutomationTone; check: boolean } {
  const reminder = a.event === "overdue_reminder";
  const who = ROLE_WORD[a.recipientRole];
  switch (a.status) {
    case "sent":
      return reminder
        ? { text: `Reminder sent ${fmtWhen(a.at, nowMs)}`, tone: "muted", check: false }
        : { text: `${capitalize(who)} notified`, tone: "muted", check: true };
    case "queued":
    case "accepted":
      return { text: reminder ? "Sending reminder…" : `Notifying ${who}…`, tone: "muted", check: false };
    case "retrying":
      return {
        text: reminder ? "Reminder delayed — retrying automatically" : "Notification delayed — retrying automatically",
        tone: "warning",
        check: false,
      };
    case "failed":
      return {
        text: reminder ? "Reminder failed — LendLoop is on it" : "Notification failed — LendLoop is on it",
        tone: "danger",
        check: false,
      };
  }
}

/** Reassurance shown to a borrower whose request notification is delayed. */
export function delayedNotificationNote(ownerName: string): string {
  return `Notification delayed — we'll retry automatically. Your request is still visible to ${firstName(ownerName)} in LendLoop.`;
}

export type DeliveryChipStatus = DeliveryStatus | "duplicate_ignored";
export type DeliveryChipTone = "success" | "warning" | "danger" | "slate" | "neutral";

/**
 * Delivery chip label. Users: "Sent", "Delayed — retrying automatically",
 * "Failed". Admins: "Retrying 2/3", "Failed 3/3", "Duplicate ignored".
 * Attempt numbers appear only when > 1 ("Sent · attempt 2").
 */
export function deliveryChipLabel(
  status: DeliveryChipStatus,
  opts: { audience: "user" | "admin"; attempts?: number; maxAttempts?: number },
): { label: string; tone: DeliveryChipTone } {
  const attempts = opts.attempts ?? 1;
  const max = opts.maxAttempts ?? MAX_ATTEMPTS;
  const admin = opts.audience === "admin";
  switch (status) {
    case "sent":
      return { label: attempts > 1 ? `Sent · attempt ${attempts}` : "Sent", tone: "success" };
    case "retrying":
      return { label: admin ? `Retrying ${attempts}/${max}` : "Delayed — retrying automatically", tone: "warning" };
    case "failed":
      return { label: admin ? `Failed ${attempts}/${max}` : "Failed", tone: "danger" };
    case "duplicate_ignored":
      return { label: "Duplicate ignored", tone: "slate" };
    case "queued":
    case "accepted":
      return { label: "Sending…", tone: "neutral" };
  }
}

// ─── Timeline copy ────────────────────────────────────────────────────────

export type TimelineContext = {
  ownerName: string;
  borrowerName: string;
  startDate: ISODate;
  endDate: ISODate;
};

/**
 * Text of one activity row, e.g. "Requested by Maya L. · Oct 31 → Nov 3",
 * "Approved by Rina S.", "Declined by Arif H.: “Needed it that weekend”",
 * "Declined · Dates taken", "Cancelled · by borrower", "Arif says it's returned",
 * "Rina S. marked it returned", "Loan started", "Loan became overdue",
 * "Overdue reminder sent to borrower", "Overdue reminder attempt 1 failed".
 */
export function timelineEventText(ev: TimelineEventDTO, ctx: TimelineContext): string {
  switch (ev.kind) {
    case "derived":
      return ev.type === "started" ? "Loan started" : "Loan became overdue";
    case "automation":
      return automationEventText(ev.event, ev.recipientRole, ev.status);
    case "attempt":
      return attemptEventText(ev.event, ev.outcome, ev.attempt);
    case "human": {
      const actor = ev.actorName;
      switch (ev.type) {
        case "requested":
          return `Requested by ${actor ?? ctx.borrowerName} · ${fmtArrowRange(ctx.startDate, ctx.endDate)}`;
        case "approved":
          return `Approved by ${actor ?? ctx.ownerName}`;
        case "declined":
          if (!actor) return `Declined · ${ev.detail ?? SYSTEM_DECLINE_REASON}`;
          return ev.detail ? `Declined by ${actor}: “${ev.detail}”` : `Declined by ${actor}`;
        case "cancelled":
          if (actor) return "Cancelled · by borrower";
          return `Cancelled · ${ev.detail ?? "listing removed"}`;
        case "return_reported":
          return `${firstName(actor ?? ctx.borrowerName)} says it's returned`;
        case "returned":
          return `${actor ?? ctx.ownerName} marked it returned`;
      }
    }
  }
}

/** Which party a human event belongs to, for the person chip. Null for system actions. */
export function timelineActorRole(ev: TimelineEventDTO): "owner" | "borrower" | null {
  if (ev.kind !== "human" || !ev.actorName) return null;
  switch (ev.type) {
    case "requested":
    case "cancelled":
    case "return_reported":
      return "borrower";
    default:
      return "owner";
  }
}

// ─── Dialog copy ──────────────────────────────────────────────────────────

/** "Approving will automatically decline 1 overlapping request (Dimas P., Nov 8–9) with the reason 'Dates taken'. They'll be notified." */
export function approveOverlapText(overlaps: LoanRowDTO["overlaps"]): string {
  const n = overlaps.length;
  const list = overlaps.map((o) => `${o.borrowerName}, ${fmtRangeShort(o.startDate, o.endDate)}`).join("; ");
  return `Approving will automatically decline ${n} overlapping ${plural(n, "request")} (${list}) with the reason '${SYSTEM_DECLINE_REASON}'. They'll be notified.`;
}

/** Remove-listing impact summary from AdminListingDTO.impact. */
export function removeImpactText(impact: AdminListingDTO["impact"]): string {
  const { pendingCount: p, upcomingCount: u, activeLoan } = impact;
  let text = `${p} pending ${plural(p, "request")} will be cancelled.`;
  if (u) text += ` ${u} upcoming ${plural(u, "booking")} will be cancelled.`;
  if (activeLoan) {
    text += ` 1 active loan (${activeLoan.borrowerName}${activeLoan.overdue ? ", overdue" : ""}) stays open until it's returned.`;
  }
  return text;
}

/** "Mark Cast-iron Dutch oven as returned?": drops a trailing size like "5.5 qt" the way the prototype does. */
export function markReturnedTitle(toolName: string): string {
  return `Mark ${toolName.replace(/\s+[\d.]+\s*qt$/i, "")} as returned?`;
}

// ─── Toasts and fixed microcopy (A9) ──────────────────────────────────────

export const TOAST_COPY = {
  listed: "Listed! Neighbors can now request it.",
  requestSent: (ownerName: string) => `Request sent — ${firstName(ownerName)} will be notified.`,
  approved: (borrowerName: string) => `Approved. We're notifying ${firstName(borrowerName)}.`,
  declined: "Request declined.",
  markedReturned: "Marked as returned. Thanks for lending!",
  reportedReturned: (ownerName: string) => `Thanks! We're letting ${firstName(ownerName)} know.`,
  trustedGranted: (name: string) => `${name} is now a Trusted Lender.`,
  trustedRevoked: (name: string) => `Removed the Trusted Lender badge from ${name}.`,
  listingRemoved: "Listing removed.",
  listingDeleted: "Listing deleted",
} as const;

export const TRUSTED_TOOLTIP = "Trusted Lender: Marked as a Trusted Lender by LendLoop admins";
export const OFFLINE_ACTION_REASON = "You're offline. Reconnect to continue.";
export const CONTACT_LOCKED_NOTE = "Contact details are shared after approval.";
export const DEGRADED_NOTIFICATIONS = "Notifications are delayed — we'll retry automatically.";
