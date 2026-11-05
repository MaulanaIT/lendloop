import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { CONFIG_KEYS, MAX_ATTEMPTS, N8N_WORKFLOW_IDS, resendCheck, type N8nWorkflowId } from "../lib/domain/automation";
import { REMOVE_REASONS, type RemoveReason } from "../lib/domain/categories";
import type {
  AdminListingDTO,
  AdminUserDTO,
  AutomationHealthDTO,
  DeliveryDTO,
  LoanRowDTO,
  ReminderRunDTO,
} from "../lib/domain/dto";
import { daysOverdue, deriveLoanStatus, isOverdue } from "../lib/domain/status";
import { appError, requireAdmin } from "./lib/auth";
import { DAY_MS, countFailed24h } from "./lib/automationStats";
import { LoanViews, refNumber } from "./lib/loanViews";
import { enqueueNotification } from "./lib/notify";
import { UserCache, initials } from "./lib/people";
import { queryNow, queryToday, serverToday } from "./lib/today";
import { currentLoan, loansForTool } from "./lib/toolState";

// Every function here starts with requireAdmin: the role is read from the
// users table on the server, never from the client.

export const loans = query({
  args: {},
  handler: async (ctx): Promise<LoanRowDTO[]> => {
    await requireAdmin(ctx);
    const views = new LoanViews(ctx, await queryToday(ctx));
    // viewerRole "admin" for every row, so contactEmail is always null here,
    // even on the admin's own loans.
    const rows = await Promise.all((await ctx.db.query("loans").collect()).map((l) => views.row(l, "admin")));
    return rows.sort((a, b) => {
      const oa = a.status === "overdue" ? 0 : 1;
      const ob = b.status === "overdue" ? 0 : 1;
      if (oa !== ob) return oa - ob;
      if (a.endDate !== b.endDate) return a.endDate < b.endDate ? -1 : 1;
      return refNumber(a.ref) - refNumber(b.ref);
    });
  },
});

export const listings = query({
  args: {},
  handler: async (ctx): Promise<AdminListingDTO[]> => {
    await requireAdmin(ctx);
    const today = await queryToday(ctx);
    const users = new UserCache(ctx);
    // Owner-deleted listings are gone from every list; admin-removed ones stay visible here.
    const tools = (await ctx.db.query("tools").collect()).filter((t) => t.deletedAt === undefined);
    return await Promise.all(
      tools.map(async (tool): Promise<AdminListingDTO> => {
        const loans = await loansForTool(ctx, tool._id);
        const current = currentLoan(loans, today);
        const overdue = current ? isOverdue(current, today) : false;
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          owner: await users.person(tool.ownerId),
          createdAt: tool.createdAt,
          status: tool.removed ? "removed" : current ? (overdue ? "overdue" : "on_loan") : "available",
          daysOverdue: current && overdue ? daysOverdue(current, today) : 0,
          removed: tool.removed
            ? {
                byName: (await users.name(tool.removed.by)) ?? "",
                at: tool.removed.at,
                reason: tool.removed.reason,
                detail: tool.removed.detail ?? null,
              }
            : null,
          impact: {
            pendingCount: loans.filter((l) => l.status === "pending").length,
            upcomingCount: loans.filter((l) => deriveLoanStatus(l, today) === "upcoming").length,
            activeLoan: current
              ? { borrowerName: (await users.name(current.borrowerId)) ?? "", overdue }
              : null,
          },
        };
      }),
    );
  },
});

/**
 * Soft-removes any listing. Pending requests and approved loans that haven't
 * started are cancelled ("listing removed"); a loan already out stays open
 * until the owner marks it returned.
 */
export const removeListing = mutation({
  args: { toolId: v.id("tools"), reason: v.string(), detail: v.optional(v.string()) },
  handler: async (ctx, { toolId, reason, detail }): Promise<null> => {
    const admin = await requireAdmin(ctx);
    if (!(REMOVE_REASONS as readonly string[]).includes(reason)) {
      throw appError("VALIDATION", "Pick a reason.", "reason");
    }
    const cleanDetail = detail?.trim() || undefined;
    if (reason === "Other" && !cleanDetail) throw appError("VALIDATION", "Add a few details.", "detail");
    if (cleanDetail && cleanDetail.length > 280) {
      throw appError("VALIDATION", "Keep the details under 280 characters.", "detail");
    }

    const tool = await ctx.db.get("tools", toolId);
    if (!tool || tool.deletedAt !== undefined) throw appError("NOT_FOUND");
    if (tool.removed) throw appError("ALREADY_HANDLED", "This listing was already removed.");

    const today = serverToday();
    const now = Date.now();
    await ctx.db.patch("tools", tool._id, {
      removed: { by: admin._id, at: now, reason: reason as RemoveReason, detail: cleanDetail },
      updatedAt: now,
    });

    for (const loan of await loansForTool(ctx, tool._id)) {
      const status = deriveLoanStatus(loan, today);
      if (status !== "pending" && status !== "upcoming") continue;
      await ctx.db.patch("loans", loan._id, { status: "cancelled", cancelledBy: "listing_removed", cancelledAt: now });
      await ctx.db.insert("loanEvents", { loanId: loan._id, type: "cancelled", at: now, detail: "listing removed" });
      await enqueueNotification(ctx, loan, "cancelled", "borrower");
    }
    return null;
  },
});

export const users = query({
  args: {},
  handler: async (ctx): Promise<AdminUserDTO[]> => {
    const admin = await requireAdmin(ctx);
    const today = await queryToday(ctx);
    const cache = new UserCache(ctx);
    const allTools = await ctx.db.query("tools").collect();
    const allLoans = await ctx.db.query("loans").collect();
    const people = await ctx.db.query("users").collect();
    // No email column: admins manage trust, they don't need contact details.
    return await Promise.all(
      people.map(
        async (u): Promise<AdminUserDTO> => ({
          _id: u._id,
          name: u.name,
          initials: initials(u.name),
          role: u.role,
          listings: allTools.filter((t) => t.ownerId === u._id && !t.removed && t.deletedAt === undefined).length,
          loansCompleted:
            (u.loansCompletedBaseline ?? 0) +
            allLoans.filter((l) => l.ownerId === u._id && l.status === "returned").length,
          overdueNow: allLoans.filter((l) => l.borrowerId === u._id && isOverdue(l, today)).length,
          trusted: u.trusted,
          trustedGrantedByName: u.trusted ? await cache.name(u.trustedGrantedBy) : null,
          trustedGrantedAt: u.trusted ? (u.trustedGrantedAt ?? null) : null,
          isSelf: u._id === admin._id,
        }),
      ),
    );
  },
});

export const setTrusted = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }): Promise<null> => {
    const admin = await requireAdmin(ctx);
    if (userId === admin._id) throw appError("FORBIDDEN", "You can't change your own badge.");
    const user = await ctx.db.get("users", userId);
    if (!user) throw appError("NOT_FOUND");
    await ctx.db.patch(
      "users",
      user._id,
      trusted
        ? { trusted: true, trustedGrantedBy: admin._id, trustedGrantedAt: Date.now() }
        : { trusted: false, trustedGrantedBy: undefined, trustedGrantedAt: undefined },
    );
    return null;
  },
});

/**
 * Which n8n workflow ran an execution, for the editor deep link. Executions
 * Convex saw accepted by the request webhook (any notification, or a reminder
 * re-sent with "Retry now") belong to the request workflow; the rest of a
 * reminder's executions are daily runs.
 */
function workflowOf(
  d: Doc<"deliveries">,
  attempts: Doc<"deliveryAttempts">[],
  executionId: string | undefined,
): N8nWorkflowId | null {
  if (!executionId) return null;
  if (d.kind === "notification") return N8N_WORKFLOW_IDS.requestNotifications;
  const viaWebhook = attempts.some((a) => a.source === "convex" && a.outcome === "accepted" && a.executionId === executionId);
  return viaWebhook ? N8N_WORKFLOW_IDS.requestNotifications : N8N_WORKFLOW_IDS.overdueReminders;
}

function runDTO(r: Doc<"reminderRuns">): ReminderRunDTO {
  return {
    _id: r._id,
    executionId: r.executionId,
    runDate: r.runDate,
    status: r.status,
    found: r.found,
    sent: r.sent,
    skipped: r.skipped,
    duplicates: r.duplicates,
    failed: r.failed,
    durationMs: r.durationMs,
    finishedAt: r.finishedAt,
  };
}

const RUNS_SHOWN = 14;
const DELIVERY_WINDOW_MS = 7 * DAY_MS;

export const automation = query({
  args: {},
  handler: async (ctx): Promise<AutomationHealthDTO> => {
    await requireAdmin(ctx);
    const now = await queryNow(ctx);
    const today = serverToday(now);

    const runs = (await ctx.db.query("reminderRuns").withIndex("by_finished").order("desc").take(RUNS_SHOWN)).map(runDTO);

    const recent = await ctx.db
      .query("deliveries")
      .withIndex("by_created", (q) => q.gte("createdAt", now - DELIVERY_WINDOW_MS))
      .order("desc")
      .collect();

    const last24h = recent.filter((d) => d.createdAt >= now - DAY_MS);
    const loanCache = new Map<string, Doc<"loans"> | null>();
    const loanOf = async (d: Doc<"deliveries">) => {
      if (!loanCache.has(d.loanId)) loanCache.set(d.loanId, await ctx.db.get("loans", d.loanId));
      return loanCache.get(d.loanId) ?? null;
    };
    const toolNames = new Map<string, string>();
    const toolNameOf = async (loan: Doc<"loans"> | null) => {
      if (!loan) return "Deleted listing";
      if (!toolNames.has(loan.toolId)) toolNames.set(loan.toolId, (await ctx.db.get("tools", loan.toolId))?.name ?? "Deleted listing");
      return toolNames.get(loan.toolId)!;
    };

    const deliveries = await Promise.all(
      recent.map(async (d): Promise<DeliveryDTO> => {
        const loan = await loanOf(d);
        const attempts = await ctx.db
          .query("deliveryAttempts")
          .withIndex("by_delivery", (q) => q.eq("deliveryId", d._id))
          .collect();
        const resend = resendCheck(d, loan, today);
        // Field NAMES and outcomes only: payload values are never stored, so they can't leak here.
        return {
          _id: d._id,
          kind: d.kind,
          event: d.event,
          loanId: d.loanId,
          loanRef: loan?.ref ?? "",
          toolName: await toolNameOf(loan),
          recipientRole: d.recipientRole,
          status: d.status,
          attempts: d.attempts,
          maxAttempts: d.maxAttempts,
          nextRetryAt: d.nextRetryAt ?? null,
          errorCategory: d.lastErrorCategory ?? null,
          executionId: d.executionId ?? null,
          executionWorkflowId: workflowOf(d, attempts, d.executionId),
          idempotencyKey: d.idempotencyKey,
          channel: d.channel ?? null,
          signed: d.signed,
          fieldsSent: d.fieldsSent,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          attemptHistory: attempts.map((a) => ({
            attempt: a.attempt,
            outcome: a.outcome,
            at: a.at,
            errorCategory: a.errorCategory ?? null,
            executionId: a.executionId ?? null,
            workflowId: workflowOf(d, attempts, a.executionId),
          })),
          duplicatesIgnored: attempts.filter((a) => a.outcome === "duplicate_ignored").length,
          canRetry: d.status === "failed" && resend.ok,
          retryBlockedReason: resend.ok ? null : resend.reason,
        };
      }),
    );

    const workflowErrors = (
      await ctx.db
        .query("workflowErrors")
        .withIndex("by_at", (q) => q.gte("at", now - DELIVERY_WINDOW_MS))
        .order("desc")
        .collect()
    ).map((e) => ({
      _id: e._id,
      executionId: e.executionId,
      workflow: e.workflow,
      node: e.node ?? null,
      errorCategory: e.errorCategory,
      at: e.at,
    }));

    return {
      lastRun: runs[0] ?? null,
      runs,
      notifications24h: {
        total: last24h.length,
        delivered: last24h.filter((d) => d.status === "sent").length,
        retrying: last24h.filter((d) => d.status === "retrying").length,
        failed: last24h.filter((d) => d.status === "failed" && d.lastErrorCategory !== "superseded").length,
      },
      failed24h: await countFailed24h(ctx, now),
      deliveries,
      workflowErrors,
      // Presence only. Secret and URL values never leave the deployment.
      config: CONFIG_KEYS.map((key) => ({ key, configured: !!process.env[key] })),
      n8nBaseUrl: process.env.N8N_EDITOR_BASE_URL || null,
    };
  },
});

/**
 * Re-sends a failed delivery with the SAME idempotency key, so a late or
 * repeated write-back from n8n can't create a second record. Only while the
 * event still describes the loan (resendCheck): a request that was since
 * cancelled isn't re-sent, and a reminder only for today while still overdue.
 */
export const retryDelivery = mutation({
  args: { deliveryId: v.id("deliveries") },
  handler: async (ctx, { deliveryId }): Promise<null> => {
    await requireAdmin(ctx);
    const d = await ctx.db.get("deliveries", deliveryId);
    if (!d) throw appError("NOT_FOUND");
    if (d.status !== "failed") throw appError("CONFLICT", "Only failed deliveries can be retried.");
    const check = resendCheck(d, await ctx.db.get("loans", d.loanId), serverToday());
    if (!check.ok) throw appError("CONFLICT", check.reason);
    await ctx.db.patch("deliveries", d._id, {
      status: "queued",
      maxAttempts: d.attempts + MAX_ATTEMPTS,
      nextRetryAt: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.notifications.send, { deliveryId: d._id });
    return null;
  },
});
