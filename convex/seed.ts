import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  FIELDS_SENT,
  MAX_ATTEMPTS,
  notificationKey,
  reminderKey,
  type ErrorCategory,
  type NotificationEvent,
  type RecipientRole,
} from "../lib/domain/automation";
import type { Category, Condition, DeclineReason } from "../lib/domain/categories";
import { addDays, diffDays, zonedTimeToMs, type ISODate } from "../lib/domain/dates";
import { setNextLoanNumber } from "./lib/refs";
import { appTimeZone, serverToday } from "./lib/today";

// Demo data from the design brief (B1 "Seed data" + B13). The brief is written
// for "today = Thu Nov 5, 2026, 09:45"; every date below is shifted so the
// brief's Nov 5 lands on the real current day in APP_TIME_ZONE, which keeps
// "Overdue · 2 days", "Booked from Nov 8"-style states true whenever it runs.
//
//   npx convex run seed:run                     seeds an empty deployment
//   npx convex run seed:run '{"force": true}'   wipes app tables and reseeds
//
// Seeded users have no tokenIdentifier: each links to its row on the first
// sign-in with the matching *verified* email (see users.store).
// Seeded deliveries are history only; nothing here schedules a real send.

const BRIEF_TODAY = "2026-11-05";
const BRIEF_NOW = "09:45";

const TABLES = [
  "deliveryAttempts",
  "deliveries",
  "loanEvents",
  "loans",
  "tools",
  "reminderRuns",
  "workflowErrors",
  "counters",
  "users",
] as const;

type PersonKey = "maya" | "rina" | "dimas" | "sam" | "arif" | "ayu";

const PEOPLE: {
  key: PersonKey;
  name: string;
  firstName: string;
  email: string;
  joined: ISODate;
  baseline: number;
  role: "user" | "admin";
}[] = [
  // `baseline` = loans completed before this board tracked them; with the
  // seeded returned loans it adds up to the brief's "loans completed" numbers.
  { key: "maya", name: "Maya L.", firstName: "Maya", email: "maya.l@example.com", joined: "2026-09-14", baseline: 1, role: "user" },
  { key: "rina", name: "Rina S.", firstName: "Rina", email: "rina.s@example.com", joined: "2026-03-12", baseline: 13, role: "user" },
  { key: "dimas", name: "Dimas P.", firstName: "Dimas", email: "dimas.p@example.com", joined: "2026-06-08", baseline: 6, role: "user" },
  { key: "sam", name: "Sam R.", firstName: "Sam", email: "sam.r@example.com", joined: "2026-08-03", baseline: 3, role: "user" },
  { key: "arif", name: "Arif H.", firstName: "Arif", email: "arif.h@example.com", joined: "2026-07-15", baseline: 4, role: "user" },
  { key: "ayu", name: "Ayu W.", firstName: "Ayu", email: "ayu.w@example.com", joined: "2026-10-06", baseline: 0, role: "admin" },
];

const TOOLS: {
  n: number;
  name: string;
  category: Category;
  condition: Condition;
  owner: PersonKey;
  listed: ISODate;
  description: string;
  removed?: { on: ISODate; reason: "Duplicate" };
}[] = [
  { n: 1, name: "Bosch cordless drill 18V", category: "power", condition: "good", owner: "rina", listed: "2026-03-18", description: "Two batteries, charger and a 20-piece bit set." },
  { n: 2, name: "Hedge trimmer", category: "garden", condition: "likenew", owner: "rina", listed: "2026-04-02", description: "Electric, 50 cm blade, light enough for one-handed trimming." },
  { n: 3, name: "6-ft step ladder", category: "ladders", condition: "good", owner: "maya", listed: "2026-09-21", description: "Fibreglass with non-slip feet and a tool tray on top." },
  { n: 4, name: "Cast-iron Dutch oven 5.5 qt", category: "kitchen", condition: "likenew", owner: "maya", listed: "2026-09-28", description: "Enamelled, great for stews and no-knead bread." },
  { n: 5, name: "Wet/dry shop vacuum", category: "cleaning", condition: "fair", owner: "maya", listed: "2026-10-06", description: "20 L tank, hose and two nozzles included." },
  { n: 6, name: "4-person dome tent", category: "camping", condition: "good", owner: "dimas", listed: "2026-06-14", description: "Sleeps 4, easy 10-minute setup, rainfly included. Packed in its bag with all stakes." },
  { n: 7, name: "Pressure washer 2000 PSI", category: "cleaning", condition: "good", owner: "sam", listed: "2026-08-09", description: "Electric, three nozzles and a 6 m hose." },
  { n: 8, name: "KitchenAid stand mixer", category: "kitchen", condition: "good", owner: "arif", listed: "2026-07-22", description: "5 qt bowl with dough hook, whisk and flat beater." },
  { n: 9, name: "Circular saw 7¼-inch", category: "power", condition: "fair", owner: "dimas", listed: "2026-06-30", description: "Corded, fresh 24-tooth blade and a rip fence." },
  { n: 10, name: "Claw hammer & nail set", category: "hand", condition: "worn", owner: "sam", listed: "2026-08-17", description: "16 oz hammer plus a box of mixed nails; the handle is scuffed." },
  { n: 11, name: "Folding hand truck", category: "ladders", condition: "good", owner: "ayu", listed: "2026-10-20", description: "Folds flat and carries up to 70 kg of boxes." },
  { n: 12, name: "Aluminium step ladder", category: "ladders", condition: "good", owner: "maya", listed: "2026-10-30", description: "3-step, lightweight, folds slim for storage.", removed: { on: "2026-11-02", reason: "Duplicate" } },
  { n: 13, name: "Leaf blower", category: "garden", condition: "good", owner: "sam", listed: "2026-08-25", description: "Cordless with a quiet mode for early mornings; battery included." },
  { n: 14, name: "Wheelbarrow", category: "garden", condition: "fair", owner: "dimas", listed: "2026-07-03", description: "Steel 80 L tray, pneumatic tyre; a bit rusty but solid." },
];

/** "brief day + wall-clock time" → epoch ms. */
type At = [ISODate, string];

type AttemptSeed = {
  at: At;
  outcome: "accepted" | "sent" | "failed" | "duplicate_ignored";
  error?: ErrorCategory;
  exec?: string;
  attempt?: number; // defaults to the 1-based position
  source?: "convex" | "n8n";
};

type DeliverySeed = {
  event: NotificationEvent;
  to: RecipientRole;
  status: "sent" | "failed" | "retrying";
  exec: string;
  /** Reminder run date (brief ISO) for overdue reminders. */
  runDate?: ISODate;
  attempts: AttemptSeed[];
};

type LoanSeed = {
  ref: string;
  tool: number;
  borrower: PersonKey;
  start: ISODate;
  end: ISODate;
  status: Doc<"loans">["status"];
  created: At;
  approved?: At;
  declined?: { at: At; reason?: DeclineReason };
  cancelled?: At;
  returned?: At;
  returnReported?: At;
  deliveries: DeliverySeed[];
};

const sent = (at: At, exec: string): AttemptSeed[] => [{ at, outcome: "sent", exec, source: "n8n" }];

const LOANS: LoanSeed[] = [
  {
    ref: "L-1020", tool: 2, borrower: "maya", start: "2026-10-18", end: "2026-10-20", status: "returned",
    created: ["2026-10-15", "18:05"], approved: ["2026-10-16", "08:30"], returned: ["2026-10-20", "17:30"],
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_44102", attempts: sent(["2026-10-15", "18:05:04"], "exec_44102") },
      { event: "approved", to: "borrower", status: "sent", exec: "exec_44160", attempts: sent(["2026-10-16", "08:30:05"], "exec_44160") },
      { event: "returned", to: "borrower", status: "sent", exec: "exec_44518", attempts: sent(["2026-10-20", "17:30:04"], "exec_44518") },
    ],
  },
  {
    ref: "L-1031", tool: 5, borrower: "dimas", start: "2026-10-24", end: "2026-10-25", status: "returned",
    created: ["2026-10-21", "20:12"], approved: ["2026-10-22", "07:50"], returned: ["2026-10-25", "19:05"],
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_45021", attempts: sent(["2026-10-21", "20:12:03"], "exec_45021") },
      { event: "approved", to: "borrower", status: "sent", exec: "exec_45077", attempts: sent(["2026-10-22", "07:50:04"], "exec_45077") },
      { event: "returned", to: "borrower", status: "sent", exec: "exec_45390", attempts: sent(["2026-10-25", "19:05:03"], "exec_45390") },
    ],
  },
  {
    ref: "L-1038", tool: 8, borrower: "maya", start: "2026-11-14", end: "2026-11-15", status: "declined",
    created: ["2026-10-31", "19:20"], declined: { at: ["2026-11-01", "10:05"], reason: "Needed it that weekend" },
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_46511", attempts: sent(["2026-10-31", "19:20:04"], "exec_46511") },
      { event: "declined", to: "borrower", status: "sent", exec: "exec_46790", attempts: sent(["2026-11-01", "10:05:03"], "exec_46790") },
    ],
  },
  {
    ref: "L-1040", tool: 9, borrower: "arif", start: "2026-10-29", end: "2026-11-01", status: "approved",
    created: ["2026-10-26", "12:10"], approved: ["2026-10-26", "18:40"],
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_45602", attempts: sent(["2026-10-26", "12:10:04"], "exec_45602") },
      { event: "approved", to: "borrower", status: "sent", exec: "exec_45688", attempts: sent(["2026-10-26", "18:40:03"], "exec_45688") },
      { event: "overdue_reminder", runDate: "2026-11-02", to: "borrower", status: "sent", exec: "exec_46902", attempts: sent(["2026-11-02", "09:00:05"], "exec_46902") },
      { event: "overdue_reminder", runDate: "2026-11-03", to: "borrower", status: "sent", exec: "exec_47311", attempts: sent(["2026-11-03", "09:00:03"], "exec_47311") },
      { event: "overdue_reminder", runDate: "2026-11-04", to: "borrower", status: "sent", exec: "exec_47790", attempts: sent(["2026-11-04", "09:01:02"], "exec_47790") },
      {
        event: "overdue_reminder", runDate: "2026-11-05", to: "borrower", status: "failed", exec: "exec_48213",
        attempts: [
          { at: ["2026-11-05", "09:00:04"], outcome: "failed", error: "timeout", exec: "exec_48213", source: "n8n" },
          { at: ["2026-11-05", "09:00:34"], outcome: "failed", error: "timeout", exec: "exec_48213", source: "n8n" },
          { at: ["2026-11-05", "09:01:34"], outcome: "failed", error: "timeout", exec: "exec_48213", source: "n8n" },
        ],
      },
    ],
  },
  {
    ref: "L-1042", tool: 1, borrower: "maya", start: "2026-10-31", end: "2026-11-03", status: "approved",
    created: ["2026-10-28", "19:30"], approved: ["2026-10-29", "14:01"],
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_46120", attempts: sent(["2026-10-28", "19:30:04"], "exec_46120") },
      { event: "approved", to: "borrower", status: "sent", exec: "exec_46233", attempts: sent(["2026-10-29", "14:02:01"], "exec_46233") },
      { event: "overdue_reminder", runDate: "2026-11-04", to: "borrower", status: "sent", exec: "exec_47790", attempts: sent(["2026-11-04", "09:00:02"], "exec_47790") },
      {
        event: "overdue_reminder", runDate: "2026-11-05", to: "borrower", status: "sent", exec: "exec_48213",
        attempts: [
          { at: ["2026-11-05", "09:00:03"], outcome: "failed", error: "timeout", exec: "exec_48213", source: "n8n" },
          { at: ["2026-11-05", "09:02:11"], outcome: "sent", exec: "exec_48213", source: "n8n" },
          // A retried write-back from n8n, ignored by idempotency key (admin-only row).
          { at: ["2026-11-05", "09:03:40"], outcome: "duplicate_ignored", exec: "exec_48213", attempt: 2, source: "n8n" },
        ],
      },
    ],
  },
  {
    ref: "L-1044", tool: 5, borrower: "sam", start: "2026-11-12", end: "2026-11-13", status: "cancelled",
    created: ["2026-11-01", "14:00"], cancelled: ["2026-11-02", "09:15"],
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_46655", attempts: sent(["2026-11-01", "14:00:04"], "exec_46655") },
      { event: "cancelled", to: "owner", status: "sent", exec: "exec_46931", attempts: sent(["2026-11-02", "09:15:03"], "exec_46931") },
    ],
  },
  {
    ref: "L-1049", tool: 4, borrower: "arif", start: "2026-11-04", end: "2026-11-06", status: "approved",
    created: ["2026-11-02", "11:30"], approved: ["2026-11-02", "16:45"], returnReported: ["2026-11-05", "09:10"],
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_46960", attempts: sent(["2026-11-02", "11:30:04"], "exec_46960") },
      { event: "approved", to: "borrower", status: "sent", exec: "exec_47005", attempts: sent(["2026-11-02", "16:45:03"], "exec_47005") },
      { event: "return_reported", to: "owner", status: "sent", exec: "exec_48240", attempts: sent(["2026-11-05", "09:10:02"], "exec_48240") },
    ],
  },
  {
    ref: "L-1050", tool: 8, borrower: "dimas", start: "2026-11-02", end: "2026-11-09", status: "approved",
    created: ["2026-10-30", "08:20"], approved: ["2026-10-30", "12:00"],
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_46388", attempts: sent(["2026-10-30", "08:20:03"], "exec_46388") },
      { event: "approved", to: "borrower", status: "sent", exec: "exec_46402", attempts: sent(["2026-10-30", "12:00:04"], "exec_46402") },
    ],
  },
  {
    ref: "L-1051", tool: 7, borrower: "maya", start: "2026-11-08", end: "2026-11-09", status: "approved",
    created: ["2026-11-03", "20:00"], approved: ["2026-11-04", "08:10"],
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_47402", attempts: sent(["2026-11-03", "20:00:03"], "exec_47402") },
      { event: "approved", to: "borrower", status: "sent", exec: "exec_47744", attempts: sent(["2026-11-04", "08:10:04"], "exec_47744") },
    ],
  },
  {
    ref: "L-1054", tool: 2, borrower: "arif", start: "2026-11-07", end: "2026-11-08", status: "declined",
    created: ["2026-11-03", "15:00"], declined: { at: ["2026-11-04", "17:40"] },
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_47380", attempts: sent(["2026-11-03", "15:00:04"], "exec_47380") },
      {
        event: "declined", to: "borrower", status: "failed", exec: "exec_48166",
        attempts: [
          { at: ["2026-11-04", "17:40:02"], outcome: "failed", error: "upstream_5xx", source: "convex" },
          { at: ["2026-11-04", "17:40:32"], outcome: "failed", error: "upstream_5xx", source: "convex" },
          { at: ["2026-11-04", "17:41:32"], outcome: "failed", error: "upstream_5xx", exec: "exec_48166", source: "convex" },
        ],
      },
    ],
  },
  {
    ref: "L-1055", tool: 6, borrower: "maya", start: "2026-11-14", end: "2026-11-16", status: "pending",
    created: ["2026-11-05", "09:44"],
    deliveries: [
      {
        event: "requested", to: "owner", status: "retrying", exec: "exec_48252",
        attempts: [
          { at: ["2026-11-05", "09:44:01"], outcome: "failed", error: "upstream_5xx", source: "convex" },
          { at: ["2026-11-05", "09:44:31"], outcome: "failed", error: "upstream_5xx", exec: "exec_48252", source: "convex" },
        ],
      },
    ],
  },
  {
    ref: "L-1057", tool: 3, borrower: "sam", start: "2026-11-07", end: "2026-11-08", status: "pending",
    created: ["2026-11-05", "07:45"],
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_48120", attempts: sent(["2026-11-05", "07:46:03"], "exec_48120") },
    ],
  },
  {
    ref: "L-1058", tool: 3, borrower: "dimas", start: "2026-11-08", end: "2026-11-09", status: "pending",
    created: ["2026-11-05", "08:55"],
    deliveries: [
      { event: "requested", to: "owner", status: "sent", exec: "exec_48236", attempts: sent(["2026-11-05", "08:56:05"], "exec_48236") },
    ],
  },
];

const RUNS: { day: ISODate; exec: string; found: number; sent: number; duplicates: number; failed: number; durationMs: number }[] = [
  { day: "2026-11-03", exec: "exec_47311", found: 1, sent: 1, duplicates: 0, failed: 0, durationMs: 2600 },
  { day: "2026-11-04", exec: "exec_47790", found: 2, sent: 2, duplicates: 0, failed: 0, durationMs: 3100 },
  { day: "2026-11-05", exec: "exec_48213", found: 2, sent: 1, duplicates: 1, failed: 1, durationMs: 4200 },
];

/** Maps brief dates/times onto the real calendar (see the header comment). */
function makeClock(now: number) {
  const tz = appTimeZone();
  const today = serverToday(now);
  const day = (brief: ISODate): ISODate => addDays(today, diffDays(brief, BRIEF_TODAY));
  // If we seed before 09:45 local time, shift every timestamp back so nothing
  // lands in the future ("today 09:44" becomes "1 minute ago").
  const shift = Math.min(0, now - zonedTimeToMs(today, BRIEF_NOW, tz));
  const at = ([brief, time]: At): number => zonedTimeToMs(day(brief), time, tz) + shift;
  return { day, at };
}

async function wipe(ctx: MutationCtx) {
  for (const table of TABLES) {
    for (const doc of await ctx.db.query(table).collect()) await ctx.db.delete(table, doc._id);
  }
}

export const run = internalMutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }): Promise<string> => {
    if ((await ctx.db.query("users").first()) && !force) return "already seeded (pass {\"force\": true} to reseed)";
    if (force) await wipe(ctx);

    const now = Date.now();
    const { day, at } = makeClock(now);

    const users = {} as Record<PersonKey, Id<"users">>;
    for (const p of PEOPLE) {
      users[p.key] = await ctx.db.insert("users", {
        name: p.name,
        firstName: p.firstName,
        email: p.email,
        role: p.role,
        trusted: false,
        joinedAt: at([p.joined, "10:00"]),
        loansCompletedBaseline: p.baseline,
      });
    }
    await ctx.db.patch("users", users.rina, {
      trusted: true,
      trustedGrantedBy: users.ayu,
      trustedGrantedAt: at(["2026-10-12", "10:20"]),
    });

    const tools = {} as Record<number, Doc<"tools">>;
    for (const t of TOOLS) {
      const createdAt = at([t.listed, "12:00"]);
      const id = await ctx.db.insert("tools", {
        ownerId: users[t.owner],
        name: t.name,
        category: t.category,
        condition: t.condition,
        description: t.description,
        createdAt,
        updatedAt: createdAt,
        removed: t.removed ? { by: users.ayu, at: at([t.removed.on, "11:20"]), reason: t.removed.reason } : undefined,
      });
      tools[t.n] = (await ctx.db.get("tools", id))!;
    }

    for (const l of LOANS) {
      const tool = tools[l.tool]!;
      const ownerId = tool.ownerId;
      const borrowerId = users[l.borrower];
      const loanId = await ctx.db.insert("loans", {
        ref: l.ref,
        toolId: tool._id,
        ownerId,
        borrowerId,
        startDate: day(l.start),
        endDate: day(l.end),
        status: l.status,
        createdAt: at(l.created),
        decidedAt: l.approved ? at(l.approved) : l.declined ? at(l.declined.at) : undefined,
        declineReason: l.declined?.reason,
        declineKind: l.declined ? "owner" : undefined,
        cancelledAt: l.cancelled ? at(l.cancelled) : undefined,
        cancelledBy: l.cancelled ? "borrower" : undefined,
        returnedAt: l.returned ? at(l.returned) : undefined,
        returnedOn: l.returned ? day(l.returned[0]) : undefined,
        returnReportedAt: l.returnReported ? at(l.returnReported) : undefined,
      });

      const event = async (type: Doc<"loanEvents">["type"], when: At, actorId?: Id<"users">, detail?: string) =>
        await ctx.db.insert("loanEvents", { loanId, type, actorId, at: at(when), detail });
      await event("requested", l.created, borrowerId);
      if (l.approved) await event("approved", l.approved, ownerId);
      if (l.declined) await event("declined", l.declined.at, ownerId, l.declined.reason);
      if (l.cancelled) await event("cancelled", l.cancelled, borrowerId);
      if (l.returnReported) await event("return_reported", l.returnReported, borrowerId);
      if (l.returned) await event("returned", l.returned, ownerId);

      for (const d of l.deliveries) {
        const key =
          d.event === "overdue_reminder" ? reminderKey(l.ref, day(d.runDate!)) : notificationKey(l.ref, d.event);
        const times = d.attempts.map((a) => at(a.at));
        const delivered = d.attempts.find((a) => a.outcome === "sent");
        const real = d.attempts.filter((a) => a.outcome !== "duplicate_ignored");
        const lastReal = at(real[real.length - 1]!.at);
        const lastError = [...real].reverse().find((a) => a.error)?.error;
        const deliveryId = await ctx.db.insert("deliveries", {
          idempotencyKey: key,
          kind: d.event === "overdue_reminder" ? "reminder" : "notification",
          event: d.event,
          loanId,
          recipientRole: d.to,
          status: d.status,
          attempts: real.length,
          maxAttempts: MAX_ATTEMPTS,
          // Shown as "next retry in 30s"; deliberately not scheduled, so seeding never calls n8n.
          nextRetryAt: d.status === "retrying" ? now + 30_000 : undefined,
          lastErrorCategory: d.status === "sent" ? undefined : lastError,
          executionId: d.exec,
          channel: d.status === "sent" ? "email" : undefined,
          fieldsSent: [...FIELDS_SENT],
          signed: true,
          createdAt: Math.min(...times) - 2_000,
          updatedAt: lastReal,
          deliveredAt: delivered ? at(delivered.at) : undefined,
        });
        for (const [i, a] of d.attempts.entries()) {
          await ctx.db.insert("deliveryAttempts", {
            deliveryId,
            idempotencyKey: key,
            attempt: a.attempt ?? i + 1,
            outcome: a.outcome,
            errorCategory: a.error,
            executionId: a.exec,
            source: a.source ?? "n8n",
            at: times[i]!,
          });
        }
      }
    }

    for (const r of RUNS) {
      await ctx.db.insert("reminderRuns", {
        executionId: r.exec,
        runDate: day(r.day),
        status: r.failed > 0 ? "completed_with_failures" : "completed",
        found: r.found,
        sent: r.sent,
        skipped: 0,
        duplicates: r.duplicates,
        failed: r.failed,
        durationMs: r.durationMs,
        finishedAt: at([r.day, "09:00:00"]) + r.durationMs,
      });
    }

    await setNextLoanNumber(ctx, 1059);
    return `seeded ${PEOPLE.length} users, ${TOOLS.length} tools, ${LOANS.length} loans (today ${day(BRIEF_TODAY)})`;
  },
});
