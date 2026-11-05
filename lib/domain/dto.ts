// Shapes returned by Convex queries. Convex functions annotate their return
// types with these, and the UI consumes them, so both sides share one contract.
// Projection is deliberate: a field that isn't in a DTO never leaves the server.
//
// ─── API surface (convex/*.ts) ────────────────────────────────────────────
// users.store            mutation  ()                         → Id<"users">     create/link the viewer's row (role always "user")
// users.me               query     ()                         → ViewerDTO | null
// users.navCounts        query     ()                         → NavCountsDTO | null
//
// tools.listPublic       query     ()                         → PublicToolDTO[]  no auth; available tools only; {_id,name,category}
// tools.list             query     ()                         → ToolCardDTO[]    auth; live (not removed/deleted) tools
// tools.get              query     { toolId }                 → ToolDetailDTO    auth; NOT_FOUND if removed/deleted/missing
// tools.getForEdit       query     { toolId }                 → ToolEditDTO      auth; FORBIDDEN unless owner
// tools.create           mutation  { name, category, condition, description } → Id<"tools">
// tools.update           mutation  { toolId, name, category, condition, description } → null   owner only
// tools.remove           mutation  { toolId }                 → null             owner delete (soft); HAS_ACTIVE_LOAN if lent/booked
// tools.myListings       query     ()                         → MyListingDTO[]
//
// loans.request          mutation  { toolId, startDate, endDate } → { loanId, ref }
// loans.approve          mutation  { loanId }                 → { autoDeclined: number }
// loans.decline          mutation  { loanId, reason? }        → null
// loans.cancel           mutation  { loanId }                 → null             borrower; pending, or approved before start
// loans.reportReturned   mutation  { loanId }                 → null             borrower; notification only
// loans.markReturned     mutation  { loanId }                 → null             owner only; on_loan or overdue
// loans.myRequests       query     ()                         → LoanRowDTO[]
// loans.incoming         query     ()                         → LoanRowDTO[]
// loans.get              query     { ref }                    → LoanDetailDTO    NOT_FOUND unless party or admin
// loans.timeline         query     { loanId }                 → TimelineEventDTO[]
//
// admin.loans            query     ()                         → LoanRowDTO[]     admin; contactEmail always null
// admin.listings         query     ()                         → AdminListingDTO[]
// admin.removeListing    mutation  { toolId, reason, detail? } → null
// admin.users            query     ()                         → AdminUserDTO[]
// admin.setTrusted       mutation  { userId, trusted }        → null             not for self
// admin.automation       query     ()                         → AutomationHealthDTO
// admin.retryDelivery    mutation  { deliveryId }             → null             failed deliveries only; same idempotency key; resendCheck
//
// Crons (convex/crons.ts): clock.tick hourly (queries read the clock row, so "today"
// and 24h windows move on), notifications.expireStale every 5 min (stuck → failed · timeout).
//
// HTTP (convex/http.ts, all HMAC-signed with CONVEX_INBOUND_SECRET):
// POST /n8n/overdue-loans   { runDate? }  → OverdueLoansResponse
// POST /n8n/deliveries      DeliveryWriteBack → { ok, duplicate } | 404 { error: "unknown_key" | "unknown_loan" | "unknown_delivery" }
// POST /n8n/reminder-runs   ReminderRunWriteBack → { ok, duplicate }
// POST /n8n/errors          WorkflowErrorReport → { ok, duplicate }
// Every endpoint: 401 { error: "invalid_signature" } (signature only), 400 { error: "invalid_json" | "invalid_body", field? },
// 413 payload_too_large, 503 not_configured (CONVEX_INBOUND_SECRET unset). Unknown JSON fields are ignored.

import type { Id } from "../../convex/_generated/dataModel";
import type { Availability } from "./availability";
import type { Category, Condition, RemoveReason } from "./categories";
import type { DeliveryStatus, ErrorCategory, N8nWorkflowId, NotificationEvent, RecipientRole } from "./automation";
import type { LoanStatus, StoredLoanStatus } from "./status";

export type Role = "user" | "admin";

export type PersonDTO = {
  _id: Id<"users">;
  name: string; // "Rina S."
  initials: string; // "RS"
  trusted: boolean;
};

export type ViewerDTO = PersonDTO & {
  email: string; // the viewer's own email, for the avatar menu
  role: Role;
};

export type NavCountsDTO = {
  incomingPending: number;
  overdueBorrowing: number; // "My requests" red dot when > 0
  adminFailures24h: number | null; // null for non-admins
};

/** Public landing card. Exactly these three fields — nothing else is sent. */
export type PublicToolDTO = {
  _id: Id<"tools">;
  name: string;
  category: Category;
};

export type ToolCardDTO = {
  _id: Id<"tools">;
  name: string;
  category: Category;
  condition: Condition;
  description: string;
  owner: PersonDTO;
  availability: Availability; // already computed for this viewer (privileged = owner or admin)
  isOwner: boolean;
  createdAt: number;
};

export type ToolDetailDTO = ToolCardDTO & {
  ownerStats: { lendingSince: number; loansCompleted: number };
  bookedRanges: { start: string; end: string }[]; // approved loans only, no borrower info
  viewer: {
    isOwner: boolean;
    isAdmin: boolean;
    canRequest: boolean; // signed in, not the owner
    canEdit: boolean; // owner only (admins do NOT edit others' listings)
    canDelete: boolean; // owner and nothing lent out / booked
    deleteBlockedReason: string | null; // "Can't delete while lent out. Mark it returned first."
    canRemove: boolean; // admin and not the owner
  };
  /** Viewer's own open request on this tool, for "Request pending · Cancel". */
  myPendingRequest: { loanId: Id<"loans">; ref: string; startDate: string; endDate: string } | null;
  /** Owner only: pending requests on this tool. Null for everyone else. */
  pendingRequests:
    | { loanId: Id<"loans">; ref: string; borrower: PersonDTO; startDate: string; endDate: string; createdAt: number }[]
    | null;
};

export type ToolEditDTO = {
  _id: Id<"tools">;
  name: string;
  category: Category;
  condition: Condition;
  description: string;
  hasActiveLoan: boolean; // "This tool is on loan. Changes are visible to the current borrower."
};

export type MyListingDTO = {
  _id: Id<"tools">;
  name: string;
  category: Category;
  availability: Availability;
  pendingCount: number;
  currentLoan: { ref: string; borrowerName: string; endDate: string; returnReported: boolean } | null;
  lastLentOn: string | null; // ISO date of the last returned loan
  canDelete: boolean;
  deleteBlockedReason: string | null;
  removed: { at: number; reason: RemoveReason; detail: string | null } | null; // remover identity not shown to owner
};

/** Latest user-facing automation line for a loan row ("⚡ Reminder sent today 09:02"). */
export type AutomationLineDTO = {
  event: NotificationEvent;
  recipientRole: RecipientRole;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number; // raised by "Retry now", so "4/6" never reads "4/3"
  at: number; // last update
};

export type LoanRowDTO = {
  _id: Id<"loans">;
  ref: string;
  tool: { _id: Id<"tools">; name: string; category: Category; removed: boolean };
  owner: PersonDTO;
  borrower: PersonDTO;
  startDate: string;
  endDate: string;
  storedStatus: StoredLoanStatus;
  status: LoanStatus; // derived with the server's "today"
  daysOverdue: number;
  createdAt: number;
  decidedAt: number | null;
  declineReason: string | null;
  declineKind: "owner" | "system" | null;
  cancelledBy: "borrower" | "listing_removed" | "listing_deleted" | null;
  returnedOn: string | null;
  returnReportedAt: number | null;
  /** Counterpart's email: only for a party, only while upcoming / on loan / overdue. Always null for admins. */
  contactEmail: string | null;
  lastAutomation: AutomationLineDTO | null;
  /** Latest overdue reminder, kept apart so a later notification (e.g. return reported) doesn't hide it. */
  lastReminder: AutomationLineDTO | null;
  remindersSent: number;
  activityCount: number;
  /** Incoming pending rows: other pending requests on the same tool whose dates overlap. */
  overlaps: { loanId: Id<"loans">; ref: string; borrowerName: string; startDate: string; endDate: string }[];
  viewerRole: "owner" | "borrower" | "admin";
};

export type LoanDetailDTO = LoanRowDTO & {
  actions: {
    canApprove: boolean;
    canDecline: boolean;
    canCancel: boolean;
    canReportReturned: boolean;
    canMarkReturned: boolean;
  };
  adminView: boolean; // admin looking at a loan they're not a party to (read-only ribbon)
};

export type TimelineEventDTO =
  | {
      kind: "human";
      id: string;
      type: "requested" | "approved" | "declined" | "cancelled" | "return_reported" | "returned";
      actorName: string | null; // null for system actions
      at: number;
      detail: string | null; // decline reason, "Dates taken", "listing removed"…
    }
  | {
      /** Derived from dates, never stored: "Loan started", "Loan became overdue". */
      kind: "derived";
      id: string;
      type: "started" | "overdue";
      date: string; // ISO day
    }
  | {
      kind: "automation";
      id: string;
      event: NotificationEvent;
      recipientRole: RecipientRole;
      status: DeliveryStatus;
      attempt: number;
      maxAttempts: number;
      at: number;
      /** Admin only: technical fields. Null for regular users. */
      admin: {
        executionId: string | null;
        idempotencyKey: string;
        channel: string | null;
        errorCategory: ErrorCategory | null;
      } | null;
    }
  | {
      /** Admin only: one row per individual attempt / ignored duplicate write-back. */
      kind: "attempt";
      id: string;
      event: NotificationEvent;
      outcome: "accepted" | "sent" | "failed" | "duplicate_ignored";
      attempt: number;
      maxAttempts: number;
      /** A failed attempt after which nothing retries automatically ("Failed", not "Retrying"). */
      final: boolean;
      at: number;
      errorCategory: ErrorCategory | null;
      executionId: string | null;
      idempotencyKey: string;
    };

export type AdminListingDTO = {
  _id: Id<"tools">;
  name: string;
  category: Category;
  owner: PersonDTO;
  createdAt: number;
  status: "available" | "on_loan" | "overdue" | "removed";
  daysOverdue: number; // > 0 only when status is "overdue"
  removed: { byName: string; at: number; reason: RemoveReason; detail: string | null } | null;
  /** For the remove dialog's impact summary. */
  impact: {
    pendingCount: number;
    upcomingCount: number;
    activeLoan: { borrowerName: string; overdue: boolean } | null;
  };
};

export type AdminUserDTO = {
  _id: Id<"users">;
  name: string;
  initials: string;
  role: Role;
  listings: number;
  loansCompleted: number;
  overdueNow: number;
  trusted: boolean;
  trustedGrantedByName: string | null;
  trustedGrantedAt: number | null;
  isSelf: boolean;
};

export type DeliveryDTO = {
  _id: Id<"deliveries">;
  kind: "notification" | "reminder";
  event: NotificationEvent;
  loanId: Id<"loans">;
  loanRef: string;
  toolName: string;
  recipientRole: RecipientRole;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: number | null;
  errorCategory: ErrorCategory | null;
  executionId: string | null;
  /** n8n workflow that ran `executionId`: a reminder re-sent via "Retry now" runs in the request workflow. */
  executionWorkflowId: N8nWorkflowId | null;
  idempotencyKey: string;
  channel: string | null;
  signed: boolean;
  fieldsSent: string[];
  createdAt: number;
  updatedAt: number;
  attemptHistory: {
    attempt: number;
    outcome: "accepted" | "sent" | "failed" | "duplicate_ignored";
    at: number;
    errorCategory: ErrorCategory | null;
    executionId: string | null;
    workflowId: N8nWorkflowId | null;
  }[];
  duplicatesIgnored: number;
  canRetry: boolean;
  /** Why "Retry now" is off for a failed delivery (the loan moved on), from resendCheck. */
  retryBlockedReason: string | null;
};

export type ReminderRunDTO = {
  _id: Id<"reminderRuns">;
  executionId: string;
  runDate: string;
  status: "completed" | "completed_with_failures" | "failed";
  found: number;
  sent: number;
  skipped: number;
  duplicates: number;
  failed: number;
  durationMs: number;
  finishedAt: number;
};

export type AutomationHealthDTO = {
  lastRun: ReminderRunDTO | null;
  runs: ReminderRunDTO[];
  notifications24h: { total: number; delivered: number; retrying: number; failed: number };
  failed24h: number; // failures in the last 24h without a later successful retry (drives nav badge + banner)
  deliveries: DeliveryDTO[]; // newest first, last 7 days
  workflowErrors: { _id: Id<"workflowErrors">; executionId: string; workflow: string; node: string | null; errorCategory: ErrorCategory; at: number }[];
  config: { key: "N8N_REQUEST_WEBHOOK_URL" | "N8N_WEBHOOK_SECRET" | "CONVEX_INBOUND_SECRET"; configured: boolean }[];
  n8nBaseUrl: string | null; // N8N_EDITOR_BASE_URL, for "Open execution in n8n" links (not a secret)
};

// ─── n8n wire types ─────────────────────────────────────────────────────

export type OverdueLoanForN8n = {
  idempotencyKey: string; // reminder:L-1042:2026-11-05
  attempt: number; // 1, or the next attempt when an earlier run's reminder for this date failed
  loanId: string; // ref
  toolName: string;
  startDate: string;
  endDate: string;
  daysOverdue: number;
  recipientRole: "borrower";
  recipientFirstName: string;
  recipientEmail: string;
};

/**
 * `loans` are the overdue loans still to remind for `runDate`. `skipped` counts
 * overdue loans left out because their reminder for that date is already sent
 * or in flight, so a re-run the same day never reminds twice.
 */
export type OverdueLoansResponse = {
  runDate: string;
  loans: OverdueLoanForN8n[];
  skipped: number;
};

export type DeliveryWriteBack = {
  idempotencyKey: string;
  status: "sent" | "failed";
  attempt: number;
  executionId: string;
  channel?: string;
  errorCategory?: ErrorCategory;
};

export type ReminderRunWriteBack = {
  executionId: string;
  runDate: string;
  found: number; // overdue loans for runDate, including skipped ones
  sent: number;
  skipped: number;
  duplicates: number;
  failed: number;
  durationMs: number;
};

export type WorkflowErrorReport = {
  executionId: string;
  workflow: string;
  node?: string;
  errorCategory: ErrorCategory;
  idempotencyKey?: string;
};
