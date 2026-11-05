import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { verifySignature } from "../lib/domain/signing";
import { as, freezeTime, insertLoan, newTest, seedFixture, type T } from "./test.helpers";

let t: T;
beforeEach(() => {
  freezeTime();
  t = newTest();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function overdueLoan(ref = "L-1042") {
  const f = await seedFixture(t);
  const loan = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-10-31", endDate: "2026-11-03", status: "approved", ref });
  return { f, ...loan };
}

const attemptsOf = (deliveryId: Id<"deliveries">) =>
  t.run((ctx) =>
    ctx.db
      .query("deliveryAttempts")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", deliveryId))
      .collect(),
  );

const deliveryByKey = (key: string) =>
  t.run((ctx) =>
    ctx.db
      .query("deliveries")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", key))
      .unique(),
  );

describe("overdue endpoint data", () => {
  test("returns minimized overdue loans and skips ones already reminded for the run date", async () => {
    const { f } = await overdueLoan();
    await insertLoan(t, { toolId: f.trimmer, ownerId: f.users.rina, borrowerId: f.users.sam, startDate: "2026-11-04", endDate: "2026-11-05", status: "approved" }); // due today: not overdue
    const first = await t.query(internal.n8n.overdueLoans, { runDate: "2026-11-05" });
    expect(first.loans).toEqual([
      {
        idempotencyKey: "reminder:L-1042:2026-11-05",
        attempt: 1,
        loanId: "L-1042",
        toolName: "Bosch cordless drill 18V",
        startDate: "2026-10-31",
        endDate: "2026-11-03",
        daysOverdue: 2,
        recipientRole: "borrower",
        recipientFirstName: "Maya",
        recipientEmail: "maya@example.com",
      },
    ]);
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: "reminder:L-1042:2026-11-05", status: "sent", attempt: 1, executionId: "exec_1" });
    const second = await t.query(internal.n8n.overdueLoans, { runDate: "2026-11-05" });
    expect(second.loans).toEqual([]);
    expect(second.skipped).toBe(1);
  });

  test("a reminder that failed earlier today is offered again with the next attempt number", async () => {
    await overdueLoan();
    const key = "reminder:L-1042:2026-11-05";
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt: 1, executionId: "run_1", errorCategory: "delivery_failed" });
    const rerun = await t.query(internal.n8n.overdueLoans, { runDate: "2026-11-05" });
    expect(rerun).toMatchObject({ skipped: 0, loans: [{ idempotencyKey: key, attempt: 2 }] });
    expect(await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "sent", attempt: 2, executionId: "run_2" })).toEqual({ ok: true, duplicate: false });
    expect((await deliveryByKey(key))!).toMatchObject({ status: "sent", attempts: 2, maxAttempts: 3, executionId: "run_2" });
  });

  test("a re-run past the first 3 attempts raises maxAttempts instead of reading 4/3", async () => {
    await overdueLoan();
    const key = "reminder:L-1042:2026-11-05";
    for (const attempt of [1, 2, 3]) {
      await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt, executionId: "run_1" });
    }
    expect((await t.query(internal.n8n.overdueLoans, { runDate: "2026-11-05" })).loans[0]!.attempt).toBe(4);
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt: 4, executionId: "run_2" });
    expect((await deliveryByKey(key))!).toMatchObject({ status: "failed", attempts: 4, maxAttempts: 4 });
  });

  test("a reminder in flight through an admin retry is skipped, not sent twice", async () => {
    await overdueLoan();
    const key = "reminder:L-1042:2026-11-05";
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt: 1, executionId: "run_1" });
    const d = (await deliveryByKey(key))!;
    await t.run((ctx) => ctx.db.patch("deliveries", d._id, { status: "accepted" }));
    expect(await t.query(internal.n8n.overdueLoans, { runDate: "2026-11-05" })).toMatchObject({ loans: [], skipped: 1 });
  });
});

describe("delivery write-backs", () => {
  test("a duplicate 'sent' write-back changes nothing and is logged as duplicate_ignored", async () => {
    await overdueLoan();
    const wb = { idempotencyKey: "reminder:L-1042:2026-11-05", status: "sent" as const, attempt: 2, executionId: "exec_48213", channel: "email" };
    expect(await t.mutation(internal.n8n.applyDeliveryWriteBack, wb)).toEqual({ ok: true, duplicate: false });
    const before = (await deliveryByKey(wb.idempotencyKey))!;
    expect(before).toMatchObject({ kind: "reminder", event: "overdue_reminder", status: "sent", attempts: 2, channel: "email" });

    vi.advanceTimersByTime(60_000);
    expect(await t.mutation(internal.n8n.applyDeliveryWriteBack, wb)).toEqual({ ok: true, duplicate: true });
    const after = (await deliveryByKey(wb.idempotencyKey))!;
    expect(after).toEqual(before);
    expect((await attemptsOf(before._id)).map((a) => a.outcome)).toEqual(["sent", "duplicate_ignored"]);
    // Exactly one delivery row for the key: no duplicate reminder.
    expect(await t.run(async (ctx) => (await ctx.db.query("deliveries").collect()).length)).toBe(1);
  });

  test("failed never overrides sent; a repeated failed attempt is a duplicate", async () => {
    await overdueLoan();
    const key = "reminder:L-1042:2026-11-05";
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt: 1, executionId: "e1", errorCategory: "timeout" });
    // n8n only writes "failed" after its own SMTP retries, so it is final until someone retries.
    expect((await deliveryByKey(key))!.status).toBe("failed");
    expect(await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt: 1, executionId: "e1", errorCategory: "timeout" })).toEqual({ ok: true, duplicate: true });
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "sent", attempt: 2, executionId: "e1" });
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt: 3, executionId: "e1", errorCategory: "timeout" });
    const d = (await deliveryByKey(key))!;
    expect(d.status).toBe("sent");
    expect(d.lastErrorCategory).toBeUndefined();
  });

  test("three failed attempts end in failed and count in failed24h", async () => {
    await overdueLoan();
    const key = "reminder:L-1042:2026-11-05";
    for (const attempt of [1, 2, 3]) {
      await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt, executionId: "e1", errorCategory: "timeout" });
    }
    expect((await deliveryByKey(key))!).toMatchObject({ status: "failed", attempts: 3, lastErrorCategory: "timeout" });
    expect((await as(t, "ayu").query(api.admin.automation, {})).failed24h).toBe(1);
  });

  test("unknown keys, loans and notification deliveries are rejected", async () => {
    await overdueLoan();
    const wb = (idempotencyKey: string) => t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey, status: "sent", attempt: 1, executionId: "e" });
    expect(await wb("hello")).toEqual({ ok: false, error: "unknown_key" });
    expect(await wb("reminder:L-9999:2026-11-05")).toEqual({ ok: false, error: "unknown_loan" });
    expect(await wb("notify:L-1042:approved")).toEqual({ ok: false, error: "unknown_delivery" });
  });
});

describe("reminder runs and workflow errors", () => {
  test("reminder runs upsert by executionId", async () => {
    const run = { executionId: "exec_1", runDate: "2026-11-05", found: 2, sent: 1, skipped: 0, duplicates: 1, failed: 1, durationMs: 4200 };
    expect(await t.mutation(internal.n8n.applyReminderRun, run)).toEqual({ ok: true, duplicate: false });
    expect(await t.mutation(internal.n8n.applyReminderRun, { ...run, sent: 2 })).toEqual({ ok: true, duplicate: true });
    const runs = await t.run((ctx) => ctx.db.query("reminderRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ sent: 1, status: "completed_with_failures" });

    await t.mutation(internal.n8n.applyReminderRun, { ...run, executionId: "exec_2", sent: 0, duplicates: 0, failed: 2 });
    await t.mutation(internal.n8n.applyReminderRun, { ...run, executionId: "exec_3", found: 2, sent: 0, skipped: 2, duplicates: 0, failed: 0 });
    const byExec = Object.fromEntries((await t.run((ctx) => ctx.db.query("reminderRuns").collect())).map((r) => [r.executionId, r.status]));
    expect(byExec).toEqual({ exec_1: "completed_with_failures", exec_2: "failed", exec_3: "completed" });
  });

  test("workflow errors dedupe and fail the linked delivery", async () => {
    await overdueLoan();
    const key = "reminder:L-1042:2026-11-05";
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt: 1, executionId: "e1", errorCategory: "timeout" });
    const report = { executionId: "e1", workflow: "LendLoop · Overdue reminders", errorCategory: "upstream_5xx" as const, idempotencyKey: key };
    expect(await t.mutation(internal.n8n.applyWorkflowError, report)).toEqual({ ok: true, duplicate: false });
    expect(await t.mutation(internal.n8n.applyWorkflowError, report)).toEqual({ ok: true, duplicate: true });
    expect((await deliveryByKey(key))!).toMatchObject({ status: "failed", lastErrorCategory: "upstream_5xx" });
    expect(await t.run(async (ctx) => (await ctx.db.query("workflowErrors").collect()).length)).toBe(1);
  });
});

describe("reminder info on loan rows and listings", () => {
  test("the latest reminder survives a later return-reported notification; listings show days overdue", async () => {
    const { loanId, f } = await overdueLoan();
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: "reminder:L-1042:2026-11-05", status: "sent", attempt: 1, executionId: "run_1" });
    vi.advanceTimersByTime(60_000);
    await as(t, "maya").mutation(api.loans.reportReturned, { loanId });
    const row = (await as(t, "maya").query(api.loans.myRequests, {})).find((r) => r._id === loanId)!;
    expect(row.lastAutomation).toMatchObject({ event: "return_reported" });
    expect(row.lastReminder).toMatchObject({ event: "overdue_reminder", status: "sent" });
    const listing = (await as(t, "ayu").query(api.admin.listings, {})).find((l) => l._id === f.drill)!;
    expect(listing).toMatchObject({ status: "overdue", daysOverdue: 2 });
    expect((await as(t, "ayu").query(api.admin.listings, {})).find((l) => l._id === f.trimmer)!.daysOverdue).toBe(0);
  });
});

describe("workflow errors without an idempotency key", () => {
  async function acceptedRequest(executionId: string) {
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.test/webhook/lendloop");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "outbound-secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ accepted: true, executionId }), { status: 202 })));
    const f = await seedFixture(t);
    const { ref } = await as(t, "maya").mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-14", endDate: "2026-11-15" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return `notify:${ref}:requested`;
  }

  test("a crashed request execution fails the delivery Convex saw accepted, counted once", async () => {
    const key = await acceptedRequest("41");
    expect((await deliveryByKey(key))!).toMatchObject({ status: "accepted", executionId: "41" });
    const report = { executionId: "41", workflow: "LendLoop · Request notifications", node: "Write back delivery", errorCategory: "network" as const };
    expect(await t.mutation(internal.n8n.applyWorkflowError, report)).toEqual({ ok: true, duplicate: false });
    expect((await deliveryByKey(key))!).toMatchObject({ status: "failed", lastErrorCategory: "network" });
    const stored = await t.run((ctx) => ctx.db.query("workflowErrors").collect());
    expect(stored[0]!.idempotencyKey).toBe(key);
    // The failed delivery and the crash are the same failure.
    expect((await as(t, "ayu").query(api.admin.automation, {})).failed24h).toBe(1);
  });

  test("a crashed reminder run is not pinned on a reminder that shares its execution id", async () => {
    await overdueLoan();
    const key = "reminder:L-1042:2026-11-05";
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "sent", attempt: 1, executionId: "77" });
    await t.mutation(internal.n8n.applyWorkflowError, { executionId: "77", workflow: "LendLoop · Overdue reminders", node: "Post run summary", errorCategory: "upstream_5xx" });
    expect((await deliveryByKey(key))!.status).toBe("sent");
    expect((await as(t, "ayu").query(api.admin.automation, {})).failed24h).toBe(1);
  });

  test("a failed write-back that lands before the 202 is recorded stays failed", async () => {
    const key = await acceptedRequest("52");
    const d = (await deliveryByKey(key))!;
    await t.run((ctx) => ctx.db.patch("deliveries", d._id, { status: "queued", executionId: undefined }));
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt: 1, executionId: "52", errorCategory: "delivery_failed" });
    await t.mutation(internal.notifications.recordAttempt, { deliveryId: d._id, attempt: 1, outcome: "accepted", executionId: "52" });
    expect((await deliveryByKey(key))!).toMatchObject({ status: "failed", executionId: "52" });
  });
});

describe("outbound send", () => {
  test("without N8N_* config the delivery fails as not_configured (no network)", async () => {
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const f = await seedFixture(t);
    const { ref } = await as(t, "maya").mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-14", endDate: "2026-11-15" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await deliveryByKey(`notify:${ref}:requested`))!).toMatchObject({ status: "failed", attempts: 1, lastErrorCategory: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("signs the minimized payload, retries 5xx with backoff, then accepts", async () => {
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.test/webhook/lendloop");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "outbound-secret");
    const calls: { body: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ body: init.body as string, headers: init.headers as Record<string, string> });
        return calls.length === 1
          ? new Response("boom", { status: 502 })
          : new Response(JSON.stringify({ executionId: "exec_9" }), { status: 202 });
      }),
    );
    const f = await seedFixture(t);
    const { ref } = await as(t, "maya").mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-14", endDate: "2026-11-15" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const d = (await deliveryByKey(`notify:${ref}:requested`))!;
    expect(d).toMatchObject({ status: "accepted", attempts: 2, executionId: "exec_9" });
    expect((await attemptsOf(d._id)).map((a) => [a.attempt, a.outcome, a.errorCategory ?? null])).toEqual([
      [1, "failed", "upstream_5xx"],
      [2, "accepted", null],
    ]);

    const payload = JSON.parse(calls[1]!.body);
    expect(Object.keys(payload).sort()).toEqual(
      ["attempt", "endDate", "event", "idempotencyKey", "loanId", "recipientEmail", "recipientFirstName", "recipientRole", "startDate", "toolName"],
    );
    expect(payload).toMatchObject({ attempt: 2, event: "requested", loanId: ref, recipientRole: "owner", recipientEmail: "rina@example.com" });
    const h = calls[1]!.headers;
    expect(h["X-Idempotency-Key"]).toBe(`notify:${ref}:requested`);
    expect(await verifySignature("outbound-secret", calls[1]!.body, h["X-LendLoop-Timestamp"]!, h["X-LendLoop-Signature"]!)).toEqual({ ok: true });
  });

  test("n8n's 400 invalid_payload is final: no retry", async () => {
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.test/webhook/lendloop");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "outbound-secret");
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_payload" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchSpy);
    const f = await seedFixture(t);
    const { ref } = await as(t, "maya").mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-14", endDate: "2026-11-15" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await deliveryByKey(`notify:${ref}:requested`))!).toMatchObject({ status: "failed", attempts: 1, lastErrorCategory: "upstream_4xx" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("admin automation links each execution to the n8n workflow that ran it", async () => {
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.test/webhook/lendloop");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "outbound-secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ accepted: true, executionId: "90" }), { status: 202 })));
    await overdueLoan();
    const key = "reminder:L-1042:2026-11-05";
    // Daily run fails, then "Retry now" re-sends through the request webhook.
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt: 1, executionId: "80" });
    const d = (await deliveryByKey(key))!;
    await as(t, "ayu").mutation(api.admin.retryDelivery, { deliveryId: d._id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "sent", attempt: 2, executionId: "90" });

    const dto = (await as(t, "ayu").query(api.admin.automation, {})).deliveries.find((x) => x._id === d._id)!;
    expect(dto).toMatchObject({ toolName: "Bosch cordless drill 18V", status: "sent", executionId: "90", executionWorkflowId: "lendloopReqNotif" });
    expect(dto.attemptHistory.map((a) => [a.executionId, a.workflowId])).toEqual([
      ["80", "lendloopOverdueR"],
      ["90", "lendloopReqNotif"],
      ["90", "lendloopReqNotif"],
    ]);
  });

  test("admin retry reuses the same idempotency key", async () => {
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.test/webhook/lendloop");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "outbound-secret");
    const keys: string[] = [];
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        keys.push((init.headers as Record<string, string>)["X-Idempotency-Key"]!);
        return fail ? new Response("", { status: 401 }) : new Response("", { status: 200 });
      }),
    );
    const f = await seedFixture(t);
    const { ref } = await as(t, "maya").mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-14", endDate: "2026-11-15" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const failed = (await deliveryByKey(`notify:${ref}:requested`))!;
    expect(failed).toMatchObject({ status: "failed", attempts: 3, lastErrorCategory: "signature_rejected" });

    fail = false;
    await as(t, "ayu").mutation(api.admin.retryDelivery, { deliveryId: failed._id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await deliveryByKey(`notify:${ref}:requested`))!).toMatchObject({ status: "accepted", attempts: 4 });
    expect(new Set(keys)).toEqual(new Set([`notify:${ref}:requested`]));
    expect(await as(t, "ayu").mutation(api.admin.retryDelivery, { deliveryId: failed._id }).catch((e) => e.data.code)).toBe("CONFLICT");
  });

  test("reminder retries only while the loan is still overdue", async () => {
    const { loanId, f } = await overdueLoan();
    const key = "reminder:L-1042:2026-11-05";
    for (const attempt of [1, 2, 3]) {
      await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "failed", attempt, executionId: "e1", errorCategory: "timeout" });
    }
    const d = (await deliveryByKey(key))!;
    await as(t, "rina").mutation(api.loans.markReturned, { loanId });
    const health = await as(t, "ayu").query(api.admin.automation, {});
    expect(health.deliveries.find((x) => x._id === d._id)!.canRetry).toBe(false);
    expect(await as(t, "ayu").mutation(api.admin.retryDelivery, { deliveryId: d._id }).catch((e) => e.data.code)).toBe("CONFLICT");
    expect(f).toBeDefined();
  });

  test("automation health reports config presence only, never values", async () => {
    await seedFixture(t);
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://secret-host.example/webhook");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "s3cr3t-value");
    vi.stubEnv("CONVEX_INBOUND_SECRET", "");
    const health = await as(t, "ayu").query(api.admin.automation, {});
    expect(health.config).toEqual([
      { key: "N8N_REQUEST_WEBHOOK_URL", configured: true },
      { key: "N8N_WEBHOOK_SECRET", configured: true },
      { key: "CONVEX_INBOUND_SECRET", configured: false },
    ]);
    const text = JSON.stringify(health);
    expect(text).not.toContain("secret-host");
    expect(text).not.toContain("s3cr3t-value");
  });
});

describe("deliveries that never settle", () => {
  test("an accepted delivery with no write-back fails as timeout after 15 min and becomes retryable", async () => {
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.test/webhook/lendloop");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "outbound-secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ executionId: "61" }), { status: 202 })));
    const f = await seedFixture(t);
    const { ref } = await as(t, "maya").mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-14", endDate: "2026-11-15" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const key = `notify:${ref}:requested`;

    vi.advanceTimersByTime(10 * 60_000);
    expect(await t.mutation(internal.notifications.expireStale, {})).toBe(0);
    expect((await deliveryByKey(key))!.status).toBe("accepted");

    vi.advanceTimersByTime(6 * 60_000);
    expect(await t.mutation(internal.notifications.expireStale, {})).toBe(1);
    const d = (await deliveryByKey(key))!;
    expect(d).toMatchObject({ status: "failed", lastErrorCategory: "timeout" });
    expect((await attemptsOf(d._id)).at(-1)).toMatchObject({ outcome: "failed", errorCategory: "timeout", source: "convex", final: true });
    const health = await as(t, "ayu").query(api.admin.automation, {});
    expect(health.failed24h).toBe(1);
    expect(health.deliveries.find((x) => x._id === d._id)!.canRetry).toBe(true);
    // A write-back that finally arrives still wins.
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: key, status: "sent", attempt: 1, executionId: "61" });
    expect((await deliveryByKey(key))!.status).toBe("sent");
  });

  test("a retrying delivery whose retry is still due is left alone", async () => {
    const f = await seedFixture(t);
    const { loanId } = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-14", endDate: "2026-11-15", status: "pending" });
    const now = Date.now();
    const row = (key: string, nextRetryAt: number) =>
      t.run((ctx) =>
        ctx.db.insert("deliveries", {
          idempotencyKey: key, kind: "notification", event: "requested", loanId, recipientRole: "owner", status: "retrying",
          attempts: 2, maxAttempts: 3, nextRetryAt, fieldsSent: [], signed: true, createdAt: now - 20 * 60_000, updatedAt: now - 20 * 60_000,
        }),
      );
    await row("notify:L-1:requested", now - 5 * 60_000); // due 5 min ago: the scheduled send may just be late
    await row("notify:L-2:requested", now - 18 * 60_000); // due 18 min ago: the send never ran
    expect(await t.mutation(internal.notifications.expireStale, {})).toBe(1);
    expect((await deliveryByKey("notify:L-1:requested"))!.status).toBe("retrying");
    expect((await deliveryByKey("notify:L-2:requested"))!.status).toBe("failed");
  });
});

describe("failed24h includes reminder runs", () => {
  test("run failures with no delivery row count; failed deliveries of the same run are not counted twice", async () => {
    await overdueLoan();
    // SMTP failure: written back, so it is a failed delivery of execution 70.
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: "reminder:L-1042:2026-11-05", status: "failed", attempt: 1, executionId: "70" });
    // Two more loans whose write-backs never reached Convex.
    await t.mutation(internal.n8n.applyReminderRun, { executionId: "70", runDate: "2026-11-05", found: 3, sent: 0, skipped: 0, duplicates: 0, failed: 3, durationMs: 4000 });
    const health = await as(t, "ayu").query(api.admin.automation, {});
    expect(health.failed24h).toBe(3);
    expect((await as(t, "ayu").query(api.users.navCounts, {}))!.adminFailures24h).toBe(3);
  });

  test("a completed run adds nothing", async () => {
    await seedFixture(t);
    await t.mutation(internal.n8n.applyReminderRun, { executionId: "71", runDate: "2026-11-05", found: 1, sent: 1, skipped: 0, duplicates: 0, failed: 0, durationMs: 900 });
    expect((await as(t, "ayu").query(api.admin.automation, {})).failed24h).toBe(0);
  });
});

describe("notifications the loan has moved past", () => {
  test("a 'requested' retry after the borrower cancelled is superseded, not sent", async () => {
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.test/webhook/lendloop");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "outbound-secret");
    const sentKeys: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const key = (init.headers as Record<string, string>)["X-Idempotency-Key"]!;
        if (key.endsWith(":requested")) return new Response("", { status: 503 });
        sentKeys.push(key);
        return new Response(JSON.stringify({ executionId: "5" }), { status: 202 });
      }),
    );
    const f = await seedFixture(t);
    const { loanId, ref } = await as(t, "maya").mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-14", endDate: "2026-11-15" });
    vi.runOnlyPendingTimers(); // first send only; the 30 s retry stays scheduled
    await t.finishInProgressScheduledFunctions();
    expect((await deliveryByKey(`notify:${ref}:requested`))!.status).toBe("retrying");

    await as(t, "maya").mutation(api.loans.cancel, { loanId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const requested = (await deliveryByKey(`notify:${ref}:requested`))!;
    expect(requested).toMatchObject({ status: "failed", lastErrorCategory: "superseded", attempts: 1 });
    expect(sentKeys).toEqual([`notify:${ref}:cancelled`]);

    // Not a failure for the badge, not retryable, and hidden from the users' line.
    const health = await as(t, "ayu").query(api.admin.automation, {});
    expect(health.failed24h).toBe(0);
    expect(health.notifications24h.failed).toBe(0);
    expect(health.deliveries.find((x) => x._id === requested._id)!.canRetry).toBe(false);
    expect(await as(t, "ayu").mutation(api.admin.retryDelivery, { deliveryId: requested._id }).catch((e) => e.data.code)).toBe("CONFLICT");
    const row = (await as(t, "maya").query(api.loans.myRequests, {})).find((r) => r._id === loanId)!;
    expect(row.lastAutomation).toMatchObject({ event: "cancelled" });
  });

  test("'Retry now' on yesterday's failed reminder is refused: today's run replaces it", async () => {
    await overdueLoan();
    const old = "reminder:L-1042:2026-11-04";
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: old, status: "failed", attempt: 1, executionId: "r1" });
    const d = (await deliveryByKey(old))!;
    const health = await as(t, "ayu").query(api.admin.automation, {});
    expect(health.deliveries.find((x) => x._id === d._id)!.canRetry).toBe(false);
    const err = await as(t, "ayu").mutation(api.admin.retryDelivery, { deliveryId: d._id }).catch((e) => e.data);
    expect(err).toMatchObject({ code: "CONFLICT" });

    const today = "reminder:L-1042:2026-11-05";
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: today, status: "failed", attempt: 1, executionId: "r2" });
    const fresh = (await deliveryByKey(today))!;
    expect((await as(t, "ayu").query(api.admin.automation, {})).deliveries.find((x) => x._id === fresh._id)!.canRetry).toBe(true);
  });
});

describe("timeline attempt chips", () => {
  test("n8n's failed write-back is final; a Convex 5xx before the last attempt is not; maxAttempts is carried", async () => {
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.test/webhook/lendloop");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "outbound-secret");
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++calls === 1 ? new Response("", { status: 502 }) : new Response(JSON.stringify({ executionId: "8" }), { status: 202 }))));
    const f = await seedFixture(t);
    const { loanId, ref } = await as(t, "maya").mutation(api.loans.request, { toolId: f.drill, startDate: "2026-11-14", endDate: "2026-11-15" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(internal.n8n.applyDeliveryWriteBack, { idempotencyKey: `notify:${ref}:requested`, status: "failed", attempt: 2, executionId: "8" });

    const events = await as(t, "ayu").query(api.loans.timeline, { loanId });
    const attempts = events.filter((e) => e.kind === "attempt");
    expect(attempts.map((a) => [a.attempt, a.final, a.maxAttempts])).toEqual([
      [2, true, 3],
      [1, false, 3],
    ]);
    expect(events.find((e) => e.kind === "automation")).toMatchObject({ status: "failed", maxAttempts: 3 });
  });
});

describe("clock", () => {
  test("tick keeps one row with the current hour", async () => {
    await t.mutation(internal.clock.tick, {});
    vi.advanceTimersByTime(3_600_000);
    await t.mutation(internal.clock.tick, {});
    const rows = await t.run((ctx) => ctx.db.query("clock").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hourMs).toBe(Math.floor(Date.now() / 3_600_000) * 3_600_000);
  });
});
