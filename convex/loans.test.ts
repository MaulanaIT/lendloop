import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { as, freezeTime, insertLoan, newTest, seedFixture, type T } from "./test.helpers";

let t: T;
beforeEach(() => {
  freezeTime();
  t = newTest();
});
afterEach(() => {
  vi.useRealTimers();
});

const errorOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { data?: { code: string; message?: string; field?: string } }) => e.data ?? null,
  );

describe("loans.request", () => {
  test("creates a pending loan with the next ref, a requested event and an owner notification", async () => {
    const f = await seedFixture(t);
    const { ref, loanId } = await as(t, "maya").mutation(api.loans.request, {
      toolId: f.drill,
      startDate: "2026-11-14",
      endDate: "2026-11-16",
    });
    expect(ref).toBe("L-1001");
    const delivery = await t.run((ctx) =>
      ctx.db
        .query("deliveries")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .unique(),
    );
    expect(delivery).toMatchObject({
      idempotencyKey: "notify:L-1001:requested",
      recipientRole: "owner",
      status: "queued",
      signed: true,
    });
    const rows = await as(t, "rina").query(api.loans.incoming, {});
    expect(rows.map((r) => [r.ref, r.status, r.viewerRole])).toEqual([["L-1001", "pending", "owner"]]);
  });

  test("date rules use the server's today", async () => {
    const f = await seedFixture(t);
    const req = (startDate: string, endDate: string) =>
      errorOf(as(t, "maya").mutation(api.loans.request, { toolId: f.drill, startDate, endDate }));
    expect(await req("2026-11-04", "2026-11-06")).toEqual({ code: "VALIDATION", message: "Start date can't be in the past.", field: "dates" });
    expect(await req("2026-11-08", "2026-11-07")).toMatchObject({ message: "End date must be on or after the start date." });
    expect(await req("2026-11-05", "2026-11-19")).toMatchObject({ message: "Requests can be up to 14 days." });
    expect(await req("2026-11-5", "2026-11-06")).toMatchObject({ code: "VALIDATION", field: "dates" });
    expect(await req("2026-11-05", "2026-11-18")).toBeNull(); // 14 days, same-day start OK
  });

  test("one pending request per tool; approved dates are taken, pending ones are not", async () => {
    const f = await seedFixture(t);
    await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.sam, startDate: "2026-11-08", endDate: "2026-11-09", status: "approved" });
    await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.ayu, startDate: "2026-11-12", endDate: "2026-11-13", status: "pending" });
    const maya = as(t, "maya");
    expect(await errorOf(maya.mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-09", endDate: "2026-11-10" }))).toEqual({
      code: "DATES_TAKEN",
      message: "Booked Nov 8–9. Pick dates after Nov 9.",
      field: "dates",
    });
    // Overlapping someone else's pending request is fine.
    await maya.mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-12", endDate: "2026-11-13" });
    expect(await errorOf(maya.mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-20", endDate: "2026-11-21" }))).toMatchObject({
      code: "DUPLICATE_REQUEST",
    });
  });
});

describe("approve / decline", () => {
  test("approving auto-declines overlapping pending requests with 'Dates taken'", async () => {
    const f = await seedFixture(t);
    const a = await as(t, "sam").mutation(api.loans.request, { toolId: f.ladder, startDate: "2026-11-07", endDate: "2026-11-08" });
    const b = await as(t, "rina").mutation(api.loans.request, { toolId: f.ladder, startDate: "2026-11-08", endDate: "2026-11-09" });
    const c = await as(t, "ayu").mutation(api.loans.request, { toolId: f.ladder, startDate: "2026-11-20", endDate: "2026-11-21" });

    const incoming = await as(t, "maya").query(api.loans.incoming, {});
    expect(incoming.find((r) => r.ref === a.ref)!.overlaps.map((o) => o.ref)).toEqual([b.ref]);

    expect(await as(t, "maya").mutation(api.loans.approve, { loanId: a.loanId })).toEqual({ autoDeclined: 1 });
    const [la, lb, lc] = await t.run((ctx) => Promise.all([a, b, c].map((x) => ctx.db.get("loans", x.loanId))));
    expect(la!.status).toBe("approved");
    expect(lb).toMatchObject({ status: "declined", declineKind: "system", declineReason: "Dates taken" });
    expect(lc!.status).toBe("pending");

    const keys = await t.run(async (ctx) => (await ctx.db.query("deliveries").collect()).map((d) => d.idempotencyKey).sort());
    expect(keys).toContain(`notify:${a.ref}:approved`);
    expect(keys).toContain(`notify:${b.ref}:declined`);

    expect(await errorOf(as(t, "maya").mutation(api.loans.approve, { loanId: a.loanId }))).toMatchObject({ code: "ALREADY_HANDLED" });
    // Sam's dates are now booked for everyone else.
    expect(await errorOf(as(t, "rina").mutation(api.loans.request, { toolId: f.ladder, startDate: "2026-11-08", endDate: "2026-11-08" }))).toMatchObject({
      code: "DATES_TAKEN",
    });
  });

  test("approve refuses requests whose dates have passed", async () => {
    const f = await seedFixture(t);
    const { loanId } = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-01", endDate: "2026-11-02", status: "pending" });
    expect(await errorOf(as(t, "rina").mutation(api.loans.approve, { loanId }))).toMatchObject({ code: "VALIDATION" });
  });

  test("decline accepts only preset reasons", async () => {
    const f = await seedFixture(t);
    const { loanId } = await as(t, "maya").mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-14", endDate: "2026-11-15" });
    const rina = as(t, "rina");
    expect(await errorOf(rina.mutation(api.loans.decline, { loanId, reason: "Free text with an email a@b.c" }))).toMatchObject({
      code: "VALIDATION",
      field: "reason",
    });
    await rina.mutation(api.loans.decline, { loanId, reason: "Needed it that weekend" });
    const row = (await as(t, "maya").query(api.loans.myRequests, {}))[0]!;
    expect(row).toMatchObject({ status: "declined", declineKind: "owner", declineReason: "Needed it that weekend" });
  });
});

describe("cancel / return", () => {
  test("borrower can cancel pending or approved-before-start, not after it started", async () => {
    const f = await seedFixture(t);
    const upcoming = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-08", endDate: "2026-11-09", status: "approved" });
    const started = await insertLoan(t, { toolId: f.trimmer, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-05", endDate: "2026-11-06", status: "approved" });
    const maya = as(t, "maya");
    await maya.mutation(api.loans.cancel, { loanId: upcoming.loanId });
    expect((await maya.query(api.loans.get, { ref: upcoming.ref })).cancelledBy).toBe("borrower");
    expect(await errorOf(maya.mutation(api.loans.cancel, { loanId: started.loanId }))).toMatchObject({ code: "CONFLICT" });
  });

  test("reportReturned is a notification only and idempotent; markReturned closes the loan", async () => {
    const f = await seedFixture(t);
    const { loanId, ref } = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-10-31", endDate: "2026-11-03", status: "approved" });
    const maya = as(t, "maya");
    await maya.mutation(api.loans.reportReturned, { loanId });
    await maya.mutation(api.loans.reportReturned, { loanId });
    const detail = await maya.query(api.loans.get, { ref });
    expect(detail.status).toBe("overdue");
    expect(detail.returnReportedAt).not.toBeNull();
    expect(detail.actions.canReportReturned).toBe(false);
    const reports = await t.run(async (ctx) =>
      (await ctx.db.query("loanEvents").collect()).filter((e) => e.type === "return_reported").length,
    );
    expect(reports).toBe(1);

    const ownerView = await as(t, "rina").query(api.loans.get, { ref });
    expect(ownerView.actions.canMarkReturned).toBe(true);
    await as(t, "rina").mutation(api.loans.markReturned, { loanId });
    const after = await maya.query(api.loans.get, { ref });
    expect(after).toMatchObject({ status: "returned", returnedOn: "2026-11-05", contactEmail: null });
  });

  test("navCounts mirror incoming pending, overdue borrowing and admin failures", async () => {
    const f = await seedFixture(t);
    await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-10-31", endDate: "2026-11-03", status: "approved" });
    await as(t, "sam").mutation(api.loans.request, { toolId: f.ladder, startDate: "2026-11-07", endDate: "2026-11-08" });
    expect(await as(t, "maya").query(api.users.navCounts, {})).toEqual({ incomingPending: 1, overdueBorrowing: 1, adminFailures24h: null });
    const admin = await as(t, "ayu").query(api.users.navCounts, {});
    const health = await as(t, "ayu").query(api.admin.automation, {});
    expect(admin!.adminFailures24h).toBe(health.failed24h);
  });
});

describe("timeline", () => {
  test("users see one row per delivery and derived events; admins also see attempts", async () => {
    const f = await seedFixture(t);
    const { loanId } = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-10-31", endDate: "2026-11-03", status: "approved", ref: "L-1042" });
    await t.run(async (ctx) => {
      const deliveryId = await ctx.db.insert("deliveries", {
        idempotencyKey: "reminder:L-1042:2026-11-05", kind: "reminder", event: "overdue_reminder", loanId,
        recipientRole: "borrower", status: "sent", attempts: 2, maxAttempts: 3, executionId: "exec_48213",
        fieldsSent: ["event"], signed: true, createdAt: 1, updatedAt: 3, deliveredAt: 3,
      });
      const base = { deliveryId, idempotencyKey: "reminder:L-1042:2026-11-05", source: "n8n" as const };
      await ctx.db.insert("deliveryAttempts", { ...base, attempt: 1, outcome: "failed", errorCategory: "timeout", at: 1 });
      await ctx.db.insert("deliveryAttempts", { ...base, attempt: 2, outcome: "sent", at: 3 });
      await ctx.db.insert("deliveryAttempts", { ...base, attempt: 2, outcome: "duplicate_ignored", at: 4 });
    });

    const user = await as(t, "maya").query(api.loans.timeline, { loanId });
    expect(user.filter((e) => e.kind === "attempt")).toHaveLength(0);
    const auto = user.filter((e) => e.kind === "automation");
    expect(auto).toHaveLength(1);
    expect(auto[0]).toMatchObject({ status: "sent", attempt: 2, admin: null });
    expect(user.filter((e) => e.kind === "derived").map((e) => e.kind === "derived" && [e.type, e.date])).toEqual([
      ["overdue", "2026-11-04"],
      ["started", "2026-10-31"],
    ]);
    expect(JSON.stringify(user)).not.toContain("exec_48213");

    const admin = await as(t, "ayu").query(api.loans.timeline, { loanId });
    expect(admin.filter((e) => e.kind === "attempt").map((e) => e.kind === "attempt" && e.outcome)).toEqual(["duplicate_ignored", "failed"]);
    expect(admin.find((e) => e.kind === "automation")).toMatchObject({ admin: { executionId: "exec_48213", idempotencyKey: "reminder:L-1042:2026-11-05" } });
  });
});
