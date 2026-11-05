import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { bookedRanges } from "../lib/domain/availability";
import { DECLINE_REASONS, SYSTEM_DECLINE_REASON } from "../lib/domain/categories";
import { fmtDay, fmtRangeShort, isISODate, type ISODate } from "../lib/domain/dates";
import type { LoanDetailDTO, LoanRowDTO, TimelineEventDTO } from "../lib/domain/dto";
import {
  RANGE_ERROR_COPY,
  deriveLoanStatus,
  rangesOverlap,
  validateRange,
} from "../lib/domain/status";
import { appError, isAdmin, requireViewer } from "./lib/auth";
import { LoanViews, partyRole, sortRows } from "./lib/loanViews";
import { enqueueNotification } from "./lib/notify";
import { nextLoanRef } from "./lib/refs";
import { queryToday, serverToday } from "./lib/today";
import { isLive, loansForTool } from "./lib/toolState";

// ─── Access helpers ──────────────────────────────────────────────────────

/**
 * Loads a loan for a state change that only `role` may make.
 * Non-parties get NOT_FOUND (a loan's existence never leaks), except admins,
 * who can already see every loan and get FORBIDDEN: they view, they don't act.
 * The wrong party (e.g. a borrower approving) gets FORBIDDEN.
 */
async function loanForAction(ctx: MutationCtx, loanId: Id<"loans">, role: "owner" | "borrower") {
  const viewer = await requireViewer(ctx);
  const loan = await ctx.db.get("loans", loanId);
  if (!loan) throw appError("NOT_FOUND");
  const party = partyRole(loan, viewer);
  if (!party) throw isAdmin(viewer) ? appError("FORBIDDEN") : appError("NOT_FOUND");
  if (party !== role) throw appError("FORBIDDEN");
  return { viewer, loan };
}

/** Read access: the two parties, or any admin (read-only). Everyone else: NOT_FOUND. */
async function loanForRead(ctx: QueryCtx, loan: Doc<"loans"> | null) {
  const viewer = await requireViewer(ctx);
  if (!loan) throw appError("NOT_FOUND");
  const party = partyRole(loan, viewer);
  if (!party && !isAdmin(viewer)) throw appError("NOT_FOUND");
  return { viewer, party };
}

/** The first approved booking (upcoming / on loan / overdue-through-today) the range collides with. */
function takenRange(loans: Doc<"loans">[], range: { startDate: ISODate; endDate: ISODate }, today: ISODate) {
  return (
    bookedRanges(loans, today).find((r) => rangesOverlap({ startDate: r.start, endDate: r.end }, range)) ?? null
  );
}

function datesTakenError(r: { start: ISODate; end: ISODate }) {
  return appError("DATES_TAKEN", `Booked ${fmtRangeShort(r.start, r.end)}. Pick dates after ${fmtDay(r.end)}.`, "dates");
}

// ─── Mutations ───────────────────────────────────────────────────────────

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }): Promise<{ loanId: Id<"loans">; ref: string }> => {
    const viewer = await requireViewer(ctx);
    const tool = await ctx.db.get("tools", toolId);
    if (!tool || !isLive(tool)) throw appError("NOT_FOUND");
    if (tool.ownerId === viewer._id) throw appError("OWN_TOOL");

    // Dates are validated against the server's "today", never the client's.
    const today = serverToday();
    if (!isISODate(startDate) || !isISODate(endDate)) {
      throw appError("VALIDATION", RANGE_ERROR_COPY.INVALID_DATE, "dates");
    }
    const rangeError = validateRange(startDate, endDate, today);
    if (rangeError) throw appError("VALIDATION", RANGE_ERROR_COPY[rangeError], "dates");

    const loans = await loansForTool(ctx, tool._id);
    if (loans.some((l) => l.borrowerId === viewer._id && l.status === "pending")) {
      throw appError("DUPLICATE_REQUEST");
    }
    // Only approved loans block dates; competing pending requests don't.
    const taken = takenRange(loans, { startDate, endDate }, today);
    if (taken) throw datesTakenError(taken);

    const now = Date.now();
    const ref = await nextLoanRef(ctx);
    const loanId = await ctx.db.insert("loans", {
      ref,
      toolId: tool._id,
      ownerId: tool.ownerId,
      borrowerId: viewer._id,
      startDate,
      endDate,
      status: "pending",
      createdAt: now,
    });
    await ctx.db.insert("loanEvents", { loanId, type: "requested", actorId: viewer._id, at: now });
    const loan = (await ctx.db.get("loans", loanId))!;
    await enqueueNotification(ctx, loan, "requested", "owner");
    return { loanId, ref };
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }): Promise<{ autoDeclined: number }> => {
    const { viewer, loan } = await loanForAction(ctx, loanId, "owner");
    if (loan.status !== "pending") throw appError("ALREADY_HANDLED");

    const today = serverToday();
    if (loan.endDate < today) {
      throw appError("VALIDATION", "These dates have already passed. Decline the request instead.", "dates");
    }
    const tool = await ctx.db.get("tools", loan.toolId);
    if (!tool || !isLive(tool)) throw appError("CONFLICT", "This listing is no longer on the board.");

    const loans = await loansForTool(ctx, loan.toolId);
    const taken = takenRange(loans, loan, today);
    if (taken) throw datesTakenError(taken);

    const now = Date.now();
    await ctx.db.patch("loans", loan._id, { status: "approved", decidedAt: now });
    await ctx.db.insert("loanEvents", { loanId: loan._id, type: "approved", actorId: viewer._id, at: now });
    await enqueueNotification(ctx, loan, "approved", "borrower");

    // One tool, one borrower per day: overlapping requests are declined by the system.
    const overlapping = loans.filter((l) => l._id !== loan._id && l.status === "pending" && rangesOverlap(l, loan));
    for (const other of overlapping) {
      await ctx.db.patch("loans", other._id, {
        status: "declined",
        declineKind: "system",
        declineReason: SYSTEM_DECLINE_REASON,
        decidedAt: now,
      });
      await ctx.db.insert("loanEvents", { loanId: other._id, type: "declined", at: now, detail: SYSTEM_DECLINE_REASON });
      await enqueueNotification(ctx, other, "declined", "borrower");
    }
    return { autoDeclined: overlapping.length };
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans"), reason: v.optional(v.string()) },
  handler: async (ctx, { loanId, reason }): Promise<null> => {
    const { viewer, loan } = await loanForAction(ctx, loanId, "owner");
    // Preset reasons only: free text would end up in the n8n payload.
    if (reason !== undefined && !(DECLINE_REASONS as readonly string[]).includes(reason)) {
      throw appError("VALIDATION", "Pick one of the listed reasons.", "reason");
    }
    if (loan.status !== "pending") throw appError("ALREADY_HANDLED");

    const now = Date.now();
    await ctx.db.patch("loans", loan._id, {
      status: "declined",
      declineKind: "owner",
      declineReason: reason,
      decidedAt: now,
    });
    await ctx.db.insert("loanEvents", { loanId: loan._id, type: "declined", actorId: viewer._id, at: now, detail: reason });
    await enqueueNotification(ctx, loan, "declined", "borrower");
    return null;
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }): Promise<null> => {
    const { viewer, loan } = await loanForAction(ctx, loanId, "borrower");
    const status = deriveLoanStatus(loan, serverToday());
    if (status === "on_loan" || status === "overdue") {
      throw appError("CONFLICT", "This loan has already started, so it can't be cancelled.");
    }
    if (status !== "pending" && status !== "upcoming") throw appError("ALREADY_HANDLED");

    const now = Date.now();
    await ctx.db.patch("loans", loan._id, { status: "cancelled", cancelledBy: "borrower", cancelledAt: now });
    await ctx.db.insert("loanEvents", { loanId: loan._id, type: "cancelled", actorId: viewer._id, at: now });
    await enqueueNotification(ctx, loan, "cancelled", "owner");
    return null;
  },
});

/**
 * "I've returned it": a heads-up to the owner only. The loan stays open (and
 * keeps getting reminders if overdue) until the owner marks it returned.
 */
export const reportReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }): Promise<null> => {
    const { viewer, loan } = await loanForAction(ctx, loanId, "borrower");
    const status = deriveLoanStatus(loan, serverToday());
    if (status !== "on_loan" && status !== "overdue") {
      throw appError("CONFLICT", "You can report a return once the loan has started.");
    }
    if (loan.returnReportedAt !== undefined) return null; // idempotent

    const now = Date.now();
    await ctx.db.patch("loans", loan._id, { returnReportedAt: now });
    await ctx.db.insert("loanEvents", { loanId: loan._id, type: "return_reported", actorId: viewer._id, at: now });
    await enqueueNotification(ctx, loan, "return_reported", "owner");
    return null;
  },
});

/** Closes the loan. Owner only: only the owner can confirm the tool is really back. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }): Promise<null> => {
    const { viewer, loan } = await loanForAction(ctx, loanId, "owner");
    const today = serverToday();
    const status = deriveLoanStatus(loan, today);
    if (status === "upcoming") throw appError("CONFLICT", "This loan hasn't started yet.");
    if (status !== "on_loan" && status !== "overdue") throw appError("ALREADY_HANDLED");

    const now = Date.now();
    await ctx.db.patch("loans", loan._id, { status: "returned", returnedAt: now, returnedOn: today });
    await ctx.db.insert("loanEvents", { loanId: loan._id, type: "returned", actorId: viewer._id, at: now });
    await enqueueNotification(ctx, loan, "returned", "borrower");
    return null;
  },
});

// ─── Queries ─────────────────────────────────────────────────────────────

export const myRequests = query({
  args: {},
  handler: async (ctx): Promise<LoanRowDTO[]> => {
    const viewer = await requireViewer(ctx);
    const views = new LoanViews(ctx, await queryToday(ctx));
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id))
      .collect();
    return sortRows(await Promise.all(loans.map((l) => views.row(l, "borrower"))));
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx): Promise<LoanRowDTO[]> => {
    const viewer = await requireViewer(ctx);
    const views = new LoanViews(ctx, await queryToday(ctx));
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
      .collect();
    return sortRows(await Promise.all(loans.map((l) => views.row(l, "owner", { withOverlaps: true }))));
  },
});

export const get = query({
  args: { ref: v.string() },
  handler: async (ctx, { ref }): Promise<LoanDetailDTO> => {
    const loan = await ctx.db
      .query("loans")
      .withIndex("by_ref", (q) => q.eq("ref", ref.trim().toUpperCase()))
      .unique();
    const { party } = await loanForRead(ctx, loan);
    const views = new LoanViews(ctx, await queryToday(ctx));
    // An admin who is a party acts as that party; otherwise it's a read-only admin view.
    const row = await views.row(loan!, party ?? "admin", { withOverlaps: party === "owner" });
    const s = row.status;
    const owner = party === "owner";
    const borrower = party === "borrower";
    return {
      ...row,
      actions: {
        canApprove: owner && s === "pending",
        canDecline: owner && s === "pending",
        canCancel: borrower && (s === "pending" || s === "upcoming"),
        canReportReturned: borrower && (s === "on_loan" || s === "overdue") && row.returnReportedAt === null,
        canMarkReturned: owner && (s === "on_loan" || s === "overdue"),
      },
      adminView: party === null,
    };
  },
});

export const timeline = query({
  args: { loanId: v.string() },
  handler: async (ctx, { loanId }): Promise<TimelineEventDTO[]> => {
    const id = ctx.db.normalizeId("loans", loanId);
    const loan = id ? await ctx.db.get("loans", id) : null;
    const { viewer } = await loanForRead(ctx, loan);
    const views = new LoanViews(ctx, await queryToday(ctx));
    // Technical fields (execution IDs, keys, error categories, attempts) are admin-only.
    return await views.timeline(loan!, isAdmin(viewer));
  },
});
