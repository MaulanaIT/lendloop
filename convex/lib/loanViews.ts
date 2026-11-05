import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { addDays, zonedTimeToMs, type ISODate } from "../../lib/domain/dates";
import type { AutomationLineDTO, LoanRowDTO, TimelineEventDTO } from "../../lib/domain/dto";
import {
  contactUnlocked,
  daysOverdue,
  deriveLoanStatus,
  rangesOverlap,
  type LoanStatus,
} from "../../lib/domain/status";
import { UserCache } from "./people";
import { appTimeZone } from "./today";

export type LoanViewerRole = "owner" | "borrower" | "admin";

/** The viewer's relation to a loan, or null when they aren't a party. */
export function partyRole(loan: Doc<"loans">, viewer: Doc<"users">): "owner" | "borrower" | null {
  if (loan.ownerId === viewer._id) return "owner";
  if (loan.borrowerId === viewer._id) return "borrower";
  return null;
}

/** Sort rank used by "My requests" and "Incoming": live loans first. */
export const STATUS_RANK: Record<LoanStatus, number> = {
  overdue: 0,
  on_loan: 1,
  upcoming: 2,
  pending: 3,
  returned: 4,
  declined: 4,
  cancelled: 4,
};

export function refNumber(ref: string): number {
  return Number(ref.slice(2)) || 0;
}

const LIVE: ReadonlySet<LoanStatus> = new Set(["overdue", "on_loan", "upcoming", "pending"]);

/** Live loans by urgency then start date; history newest reference first. */
export function sortRows(rows: LoanRowDTO[]): LoanRowDTO[] {
  return rows.sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    if (LIVE.has(a.status)) {
      if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
      return a.createdAt - b.createdAt;
    }
    return refNumber(b.ref) - refNumber(a.ref);
  });
}

type DerivedEvent = { type: "started" | "overdue"; date: ISODate; sortAt: number };

/**
 * "Loan started" / "Loan became overdue" are computed from the dates on every
 * read (never stored), with the same rule the n8n overdue endpoint uses.
 */
export function derivedEvents(loan: Doc<"loans">, today: ISODate): DerivedEvent[] {
  if (loan.status !== "approved" && loan.status !== "returned") return [];
  const horizon = loan.status === "returned" ? (loan.returnedOn ?? today) : today;
  const tz = appTimeZone();
  const out: DerivedEvent[] = [];
  if (loan.startDate <= horizon) {
    // Keep "started" after the approval when both fall on the same day.
    const dayStart = zonedTimeToMs(loan.startDate, "00:00", tz);
    out.push({ type: "started", date: loan.startDate, sortAt: Math.max(dayStart, (loan.decidedAt ?? 0) + 1) });
  }
  const overdueFrom = addDays(loan.endDate, 1);
  if (overdueFrom <= horizon) {
    out.push({ type: "overdue", date: overdueFrom, sortAt: zonedTimeToMs(overdueFrom, "00:00", tz) });
  }
  return out;
}

/**
 * Builds LoanRowDTOs with per-request caches. Projection happens here, so a
 * field that isn't in the DTO (emails, ids of strangers, payloads) never
 * leaves the server.
 */
export class LoanViews {
  readonly users: UserCache;
  private tools = new Map<Id<"tools">, Doc<"tools"> | null>();

  constructor(
    private ctx: QueryCtx,
    readonly today: ISODate,
  ) {
    this.users = new UserCache(ctx);
  }

  async tool(id: Id<"tools">): Promise<Doc<"tools"> | null> {
    if (!this.tools.has(id)) this.tools.set(id, await this.ctx.db.get("tools", id));
    return this.tools.get(id) ?? null;
  }

  async deliveries(loanId: Id<"loans">): Promise<Doc<"deliveries">[]> {
    return await this.ctx.db
      .query("deliveries")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .collect();
  }

  async row(
    loan: Doc<"loans">,
    viewerRole: LoanViewerRole,
    opts: { withOverlaps?: boolean } = {},
  ): Promise<LoanRowDTO> {
    const { ctx, today } = this;
    const [tool, owner, borrower, deliveries, events] = await Promise.all([
      this.tool(loan.toolId),
      this.users.get(loan.ownerId),
      this.users.get(loan.borrowerId),
      this.deliveries(loan._id),
      ctx.db
        .query("loanEvents")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .collect(),
    ]);
    const status = deriveLoanStatus(loan, today);

    // Contact is shared only between the two parties, and only while the
    // loan is approved / on loan / overdue. Admins never get it.
    let contactEmail: string | null = null;
    if (viewerRole !== "admin" && contactUnlocked(status)) {
      const counterpart = viewerRole === "owner" ? borrower : owner;
      contactEmail = counterpart?.email || null;
    }

    // A superseded delivery was dropped on purpose; the newer event's line replaces it.
    const shown = deliveries.filter((d) => d.lastErrorCategory !== "superseded");
    const newest = (list: Doc<"deliveries">[]) =>
      list.reduce<Doc<"deliveries"> | null>((acc, d) => (!acc || d.updatedAt > acc.updatedAt ? d : acc), null);
    const line = (d: Doc<"deliveries"> | null): AutomationLineDTO | null =>
      d
        ? {
            event: d.event,
            recipientRole: d.recipientRole,
            status: d.status,
            attempts: d.attempts,
            maxAttempts: d.maxAttempts,
            at: d.deliveredAt ?? d.updatedAt,
          }
        : null;
    const lastAutomation = line(newest(shown));
    const lastReminder = line(newest(shown.filter((d) => d.kind === "reminder")));

    let overlaps: LoanRowDTO["overlaps"] = [];
    if (opts.withOverlaps && loan.status === "pending") {
      const siblings = await ctx.db
        .query("loans")
        .withIndex("by_tool", (q) => q.eq("toolId", loan.toolId))
        .collect();
      overlaps = await Promise.all(
        siblings
          .filter((l) => l._id !== loan._id && l.status === "pending" && rangesOverlap(l, loan))
          .map(async (l) => ({
            loanId: l._id,
            ref: l.ref,
            borrowerName: (await this.users.name(l.borrowerId)) ?? "",
            startDate: l.startDate,
            endDate: l.endDate,
          })),
      );
    }

    return {
      _id: loan._id,
      ref: loan.ref,
      tool: tool
        ? { _id: tool._id, name: tool.name, category: tool.category, removed: !!tool.removed || !!tool.deletedAt }
        : { _id: loan.toolId, name: "Deleted listing", category: "other", removed: true },
      owner: await this.users.person(loan.ownerId),
      borrower: await this.users.person(loan.borrowerId),
      startDate: loan.startDate,
      endDate: loan.endDate,
      storedStatus: loan.status,
      status,
      daysOverdue: daysOverdue(loan, today),
      createdAt: loan.createdAt,
      decidedAt: loan.decidedAt ?? null,
      declineReason: loan.declineReason ?? null,
      declineKind: loan.declineKind ?? null,
      cancelledBy: loan.cancelledBy ?? null,
      returnedOn: loan.returnedOn ?? null,
      returnReportedAt: loan.returnReportedAt ?? null,
      contactEmail,
      lastAutomation,
      lastReminder,
      remindersSent: deliveries.filter((d) => d.kind === "reminder" && d.status === "sent").length,
      activityCount: events.length + shown.length + derivedEvents(loan, today).length,
      overlaps,
      viewerRole,
    };
  }

  /**
   * Newest-first activity: human events, derived date events and one row per
   * delivery with its latest status. Admins additionally get every failed
   * attempt and every ignored duplicate write-back, plus technical fields.
   */
  async timeline(loan: Doc<"loans">, admin: boolean): Promise<TimelineEventDTO[]> {
    const { ctx } = this;
    const items: { sortAt: number; event: TimelineEventDTO }[] = [];

    const events = await ctx.db
      .query("loanEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .collect();
    for (const e of events) {
      items.push({
        sortAt: e.at,
        event: {
          kind: "human",
          id: e._id,
          type: e.type,
          actorName: await this.users.name(e.actorId),
          at: e.at,
          detail: e.detail ?? null,
        },
      });
    }

    for (const d of derivedEvents(loan, this.today)) {
      items.push({ sortAt: d.sortAt, event: { kind: "derived", id: `${d.type}:${loan._id}`, type: d.type, date: d.date } });
    }

    for (const d of await this.deliveries(loan._id)) {
      // Users don't see a notification that was dropped because the loan moved on.
      if (!admin && d.lastErrorCategory === "superseded") continue;
      const at = d.deliveredAt ?? d.updatedAt;
      items.push({
        sortAt: at,
        event: {
          kind: "automation",
          id: d._id,
          event: d.event,
          recipientRole: d.recipientRole,
          status: d.status,
          attempt: d.attempts,
          maxAttempts: d.maxAttempts,
          at,
          admin: admin
            ? {
                executionId: d.executionId ?? null,
                idempotencyKey: d.idempotencyKey,
                channel: d.channel ?? null,
                errorCategory: d.lastErrorCategory ?? null,
              }
            : null,
        },
      });
      if (!admin) continue;
      const attempts = await ctx.db
        .query("deliveryAttempts")
        .withIndex("by_delivery", (q) => q.eq("deliveryId", d._id))
        .collect();
      for (const a of attempts) {
        if (a.outcome !== "failed" && a.outcome !== "duplicate_ignored") continue;
        items.push({
          sortAt: a.at,
          event: {
            kind: "attempt",
            id: a._id,
            event: d.event,
            outcome: a.outcome,
            attempt: a.attempt,
            maxAttempts: d.maxAttempts,
            // Older rows have no flag: n8n writes "failed" only after its own
            // SMTP retries (always final); Convex's last attempt is final.
            final: a.outcome === "failed" && (a.final ?? (a.source === "n8n" || a.attempt >= d.maxAttempts)),
            at: a.at,
            errorCategory: a.errorCategory ?? null,
            executionId: a.executionId ?? null,
            idempotencyKey: a.idempotencyKey,
          },
        });
      }
    }

    return items.sort((a, b) => b.sortAt - a.sortAt).map((i) => i.event);
  }
}
