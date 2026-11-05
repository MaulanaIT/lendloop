import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { ISODate } from "../../lib/domain/dates";
import { deriveLoanStatus } from "../../lib/domain/status";

/** Live = on the board: not removed by an admin and not deleted by its owner. */
export function isLive(tool: Doc<"tools">): boolean {
  return !tool.removed && tool.deletedAt === undefined;
}

export async function loansForTool(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"loans">[]> {
  return await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .collect();
}

/** The approved loan the tool is out on today (on loan or overdue), if any. */
export function currentLoan(loans: Doc<"loans">[], today: ISODate): Doc<"loans"> | null {
  return (
    loans.find((l) => {
      const s = deriveLoanStatus(l, today);
      return s === "on_loan" || s === "overdue";
    }) ?? null
  );
}

export function hasUpcomingBooking(loans: Doc<"loans">[], today: ISODate): boolean {
  return loans.some((l) => deriveLoanStatus(l, today) === "upcoming");
}

export const DELETE_BLOCKED_LENT = "Can't delete while lent out. Mark it returned first.";
export const DELETE_BLOCKED_BOOKED = "Can't delete with an approved booking. Cancel it in Incoming first.";

/** Why the owner can't delete the listing right now, or null when they can. */
export function deleteBlockedReason(loans: Doc<"loans">[], today: ISODate): string | null {
  if (currentLoan(loans, today)) return DELETE_BLOCKED_LENT;
  if (hasUpcomingBooking(loans, today)) return DELETE_BLOCKED_BOOKED;
  return null;
}
