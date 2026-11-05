import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  FIELDS_SENT,
  MAX_ATTEMPTS,
  parseIdempotencyKey,
  reminderKey,
} from "../lib/domain/automation";
import { diffDays } from "../lib/domain/dates";
import type { OverdueLoanForN8n, OverdueLoansResponse } from "../lib/domain/dto";
import { deriveLoanStatus } from "../lib/domain/status";
import { vErrorCategory } from "./lib/validators";

// Inbound side of the n8n integration. These internal functions are reachable
// only through convex/http.ts, after the HMAC signature and the body shape
// have been verified. Every write is idempotent, so n8n retries are safe.

export type WriteBackResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; error: "unknown_key" | "unknown_loan" | "unknown_delivery" };

/**
 * Overdue loans for one run date, with the same derivation the UI uses
 * (approved and runDate > endDate). A loan whose reminder for this date is
 * already sent, or in flight through an admin "Retry now", is only counted
 * in `skipped`, so a re-run never reminds twice. Only a failed reminder is
 * offered again, with the next attempt number.
 */
export const overdueLoans = internalQuery({
  args: { runDate: v.string() },
  handler: async (ctx, { runDate }): Promise<OverdueLoansResponse> => {
    const candidates = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", runDate))
      .collect();
    const loans: OverdueLoanForN8n[] = [];
    let skipped = 0;
    for (const loan of candidates) {
      if (deriveLoanStatus(loan, runDate) !== "overdue") continue;
      const key = reminderKey(loan.ref, runDate);
      const existing = await ctx.db
        .query("deliveries")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", key))
        .first();
      if (existing && existing.status !== "failed") {
        skipped++;
        continue;
      }
      const [tool, borrower] = await Promise.all([ctx.db.get("tools", loan.toolId), ctx.db.get("users", loan.borrowerId)]);
      if (!borrower) continue;
      // Minimized: only what the reminder email needs.
      loans.push({
        idempotencyKey: key,
        attempt: (existing?.attempts ?? 0) + 1,
        loanId: loan.ref,
        toolName: tool?.name ?? "Deleted listing",
        startDate: loan.startDate,
        endDate: loan.endDate,
        daysOverdue: diffDays(runDate, loan.endDate),
        recipientRole: "borrower",
        recipientFirstName: borrower.firstName,
        recipientEmail: borrower.email,
      });
    }
    return { runDate, loans, skipped };
  },
});

export const applyDeliveryWriteBack = internalMutation({
  args: {
    idempotencyKey: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    attempt: v.number(),
    executionId: v.string(),
    channel: v.optional(v.string()),
    errorCategory: v.optional(vErrorCategory),
  },
  handler: async (ctx, wb): Promise<WriteBackResult> => {
    const parsed = parseIdempotencyKey(wb.idempotencyKey);
    if (!parsed) return { ok: false, error: "unknown_key" };
    const loan = await ctx.db
      .query("loans")
      .withIndex("by_ref", (q) => q.eq("ref", parsed.loanRef))
      .unique();
    if (!loan) return { ok: false, error: "unknown_loan" };

    const now = Date.now();
    let delivery: Doc<"deliveries"> | null = await ctx.db
      .query("deliveries")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", wb.idempotencyKey))
      .first();
    if (delivery && delivery.loanId !== loan._id) return { ok: false, error: "unknown_delivery" };
    if (!delivery) {
      // Notifications are always created by Convex first; only reminders
      // (fanned out by the n8n schedule) are recorded on first write-back.
      if (parsed.kind !== "reminder") return { ok: false, error: "unknown_delivery" };
      const id = await ctx.db.insert("deliveries", {
        idempotencyKey: wb.idempotencyKey,
        kind: "reminder",
        event: "overdue_reminder",
        loanId: loan._id,
        recipientRole: "borrower",
        status: "queued",
        attempts: 0,
        maxAttempts: MAX_ATTEMPTS,
        fieldsSent: [...FIELDS_SENT],
        signed: true,
        createdAt: now,
        updatedAt: now,
      });
      delivery = (await ctx.db.get("deliveries", id))!;
    }

    const history = await ctx.db
      .query("deliveryAttempts")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", delivery._id))
      .collect();
    const alreadyRecorded = history.some((a) => a.source === "n8n" && a.attempt === wb.attempt && a.outcome === wb.status);
    const attemptRow = {
      deliveryId: delivery._id,
      idempotencyKey: delivery.idempotencyKey,
      attempt: wb.attempt,
      executionId: wb.executionId,
      source: "n8n" as const,
      at: now,
    };

    // A retried write-back changes nothing; it is only logged for admins.
    if ((wb.status === "sent" && delivery.status === "sent") || alreadyRecorded) {
      await ctx.db.insert("deliveryAttempts", { ...attemptRow, outcome: "duplicate_ignored" });
      return { ok: true, duplicate: true };
    }

    const attempts = Math.max(delivery.attempts, wb.attempt);
    // A same-day re-run offers a failed reminder again past its first 3 attempts.
    const maxAttempts = Math.max(delivery.maxAttempts, attempts);
    if (wb.status === "sent") {
      await ctx.db.insert("deliveryAttempts", { ...attemptRow, outcome: "sent" });
      await ctx.db.patch("deliveries", delivery._id, {
        status: "sent",
        attempts,
        maxAttempts,
        executionId: wb.executionId,
        channel: wb.channel ?? delivery.channel,
        deliveredAt: now,
        nextRetryAt: undefined,
        lastErrorCategory: undefined,
        updatedAt: now,
      });
      return { ok: true, duplicate: false };
    }

    const errorCategory = wb.errorCategory ?? "delivery_failed";
    await ctx.db.insert("deliveryAttempts", { ...attemptRow, outcome: "failed", errorCategory, final: true });
    // A late failure never overrides a delivery that already succeeded.
    if (delivery.status !== "sent") {
      await ctx.db.patch("deliveries", delivery._id, {
        // n8n writes "failed" only after its own 3 SMTP attempts, so this is
        // final: it shows up in failed24h and an admin can "Retry now".
        status: "failed",
        attempts,
        maxAttempts,
        executionId: wb.executionId,
        lastErrorCategory: errorCategory,
        nextRetryAt: undefined,
        updatedAt: now,
      });
    }
    return { ok: true, duplicate: false };
  },
});

export const applyReminderRun = internalMutation({
  args: {
    executionId: v.string(),
    runDate: v.string(),
    found: v.number(),
    sent: v.number(),
    skipped: v.number(),
    duplicates: v.number(),
    failed: v.number(),
    durationMs: v.number(),
  },
  handler: async (ctx, run): Promise<{ ok: true; duplicate: boolean }> => {
    const existing = await ctx.db
      .query("reminderRuns")
      .withIndex("by_execution", (q) => q.eq("executionId", run.executionId))
      .first();
    // n8n retries post the identical signed body, so the first one wins.
    if (existing) return { ok: true, duplicate: true };
    await ctx.db.insert("reminderRuns", {
      ...run,
      status: run.failed === 0 ? "completed" : run.sent === 0 ? "failed" : "completed_with_failures",
      finishedAt: Date.now(),
    });
    return { ok: true, duplicate: false };
  },
});

export const applyWorkflowError = internalMutation({
  args: {
    executionId: v.string(),
    workflow: v.string(),
    node: v.optional(v.string()),
    errorCategory: vErrorCategory,
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, report): Promise<{ ok: true; duplicate: boolean }> => {
    const existing = (
      await ctx.db
        .query("workflowErrors")
        .withIndex("by_execution", (q) => q.eq("executionId", report.executionId))
        .collect()
    ).find((e) => e.workflow === report.workflow);
    if (existing) return { ok: true, duplicate: true };

    const now = Date.now();
    // n8n's error trigger can't see the failed run's items, so the report
    // usually has no key. An execution of the request webhook handles exactly
    // one delivery, and Convex stored its execution id from the 202 reply
    // ("accepted" attempt), which tells it apart from a reminder run.
    if (!report.idempotencyKey) {
      const linked = await ctx.db
        .query("deliveries")
        .withIndex("by_execution", (q) => q.eq("executionId", report.executionId))
        .take(2);
      const only = linked.length === 1 ? linked[0]! : null;
      if (only) {
        const accepted = await ctx.db
          .query("deliveryAttempts")
          .withIndex("by_delivery", (q) => q.eq("deliveryId", only._id))
          .collect();
        if (accepted.some((a) => a.source === "convex" && a.outcome === "accepted" && a.executionId === report.executionId)) {
          report.idempotencyKey = only.idempotencyKey;
        }
      }
    }
    await ctx.db.insert("workflowErrors", { ...report, at: now });

    // A crash tied to one delivery makes that delivery visibly failed
    // (unless it was already delivered), so nothing fails silently.
    if (report.idempotencyKey) {
      const d = await ctx.db
        .query("deliveries")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", report.idempotencyKey!))
        .first();
      if (d && d.status !== "sent") {
        await ctx.db.patch("deliveries", d._id, {
          status: "failed",
          lastErrorCategory: report.errorCategory,
          executionId: report.executionId,
          nextRetryAt: undefined,
          updatedAt: now,
        });
      } else if (!d) {
        // A reminder that crashed before its first write-back: record it as
        // failed so it shows up (and can be retried) on the admin page.
        const parsed = parseIdempotencyKey(report.idempotencyKey);
        const loan =
          parsed?.kind === "reminder"
            ? await ctx.db
                .query("loans")
                .withIndex("by_ref", (q) => q.eq("ref", parsed.loanRef))
                .unique()
            : null;
        if (loan) {
          await ctx.db.insert("deliveries", {
            idempotencyKey: report.idempotencyKey,
            kind: "reminder",
            event: "overdue_reminder",
            loanId: loan._id,
            recipientRole: "borrower",
            status: "failed",
            attempts: 1,
            maxAttempts: MAX_ATTEMPTS,
            lastErrorCategory: report.errorCategory,
            executionId: report.executionId,
            fieldsSent: [...FIELDS_SENT],
            signed: true,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }
    return { ok: true, duplicate: false };
  },
});
