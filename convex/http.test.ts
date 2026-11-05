import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { signPayload } from "../lib/domain/signing";
import { freezeTime, insertLoan, newTest, seedFixture, type T } from "./test.helpers";

const SECRET = "inbound-test-secret";

let t: T;
beforeEach(() => {
  freezeTime();
  vi.stubEnv("CONVEX_INBOUND_SECRET", SECRET);
  t = newTest();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function signedPost(path: string, body: unknown, opts: { secret?: string; nowSec?: number; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const { timestamp, signature } = await signPayload(opts.secret ?? SECRET, raw, opts.nowSec);
  return t.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-LendLoop-Timestamp": timestamp, "X-LendLoop-Signature": signature },
    body: raw,
  });
}

const counts = () =>
  t.run(async (ctx) => ({
    deliveries: (await ctx.db.query("deliveries").collect()).length,
    attempts: (await ctx.db.query("deliveryAttempts").collect()).length,
    runs: (await ctx.db.query("reminderRuns").collect()).length,
    errors: (await ctx.db.query("workflowErrors").collect()).length,
  }));

const writeBack = { idempotencyKey: "reminder:L-1042:2026-11-05", status: "sent", attempt: 1, executionId: "exec_1", channel: "email" };

async function overdue() {
  const f = await seedFixture(t);
  await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-10-31", endDate: "2026-11-03", status: "approved", ref: "L-1042" });
}

describe("n8n HTTP endpoints", () => {
  test("valid signature → 200 for every endpoint, and writes are idempotent", async () => {
    await overdue();
    const overdueRes = await signedPost("/n8n/overdue-loans", {});
    expect(overdueRes.status).toBe(200);
    const listed = await overdueRes.json();
    expect(listed.runDate).toBe("2026-11-05");
    expect(listed.loans.map((l: { idempotencyKey: string }) => l.idempotencyKey)).toEqual(["reminder:L-1042:2026-11-05"]);

    const first = await signedPost("/n8n/deliveries", writeBack);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, duplicate: false });
    const second = await signedPost("/n8n/deliveries", writeBack);
    expect(await second.json()).toEqual({ ok: true, duplicate: true });
    // Same-day re-run: the reminded loan is only counted, never listed again.
    expect(await (await signedPost("/n8n/overdue-loans", { runDate: "2026-11-05" })).json()).toEqual({ runDate: "2026-11-05", loans: [], skipped: 1 });

    const run = { executionId: "exec_1", runDate: "2026-11-05", found: 1, sent: 1, skipped: 0, duplicates: 0, failed: 0, durationMs: 1200 };
    expect(await (await signedPost("/n8n/reminder-runs", run)).json()).toEqual({ ok: true, duplicate: false });
    expect(await (await signedPost("/n8n/reminder-runs", run)).json()).toEqual({ ok: true, duplicate: true });

    const err = { executionId: "exec_2", workflow: "LendLoop · Request notification", errorCategory: "timeout" };
    const errRes = await signedPost("/n8n/errors", err);
    expect(errRes.status).toBe(200);
    expect(await errRes.json()).toEqual({ ok: true, duplicate: false });

    expect(await counts()).toEqual({ deliveries: 1, attempts: 2, runs: 1, errors: 1 });
  });

  test("wrong, stale or missing signatures → 401 and nothing is written", async () => {
    await overdue();
    const before = await counts();
    expect((await signedPost("/n8n/deliveries", writeBack, { secret: "wrong" })).status).toBe(401);
    const stale = Math.floor(Date.now() / 1000) - 10 * 60;
    expect((await signedPost("/n8n/deliveries", writeBack, { nowSec: stale })).status).toBe(401);
    const unsigned = await t.fetch("/n8n/deliveries", { method: "POST", body: JSON.stringify(writeBack) });
    expect(unsigned.status).toBe(401);
    expect(await unsigned.json()).toEqual({ error: "invalid_signature" });

    // Signature over a different body than the one sent (tampering).
    const { timestamp, signature } = await signPayload(SECRET, JSON.stringify(writeBack));
    const tampered = await t.fetch("/n8n/deliveries", {
      method: "POST",
      headers: { "X-LendLoop-Timestamp": timestamp, "X-LendLoop-Signature": signature },
      body: JSON.stringify({ ...writeBack, status: "failed" }),
    });
    expect(tampered.status).toBe(401);
    expect(await counts()).toEqual(before);
  });

  test("missing secret → 503", async () => {
    vi.stubEnv("CONVEX_INBOUND_SECRET", "");
    const res = await signedPost("/n8n/overdue-loans", {});
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
  });

  test("oversized body → 413", async () => {
    const res = await signedPost("/n8n/errors", { executionId: "e", workflow: "w", errorCategory: "timeout", node: "x".repeat(17_000) });
    expect(res.status).toBe(413);
    expect(await counts()).toEqual({ deliveries: 0, attempts: 0, runs: 0, errors: 0 });
  });

  test("bad JSON or bad fields → 400", async () => {
    await overdue();
    expect((await signedPost("/n8n/deliveries", null, { raw: "{not json" })).status).toBe(400);
    expect((await signedPost("/n8n/deliveries", [1, 2])).status).toBe(400);
    expect((await signedPost("/n8n/deliveries", { ...writeBack, status: "maybe" })).status).toBe(400);
    expect((await signedPost("/n8n/deliveries", { ...writeBack, attempt: 1.5 })).status).toBe(400);
    expect((await signedPost("/n8n/deliveries", { ...writeBack, idempotencyKey: "drop table" })).status).toBe(400);
    expect((await signedPost("/n8n/deliveries", { ...writeBack, errorCategory: "oops" })).status).toBe(400);
    // Convex-only, never counted as a failure, so n8n can't use it to hide one.
    expect((await signedPost("/n8n/deliveries", { ...writeBack, status: "failed", errorCategory: "superseded" })).status).toBe(400);
    expect((await signedPost("/n8n/overdue-loans", { runDate: "2026-13-01" })).status).toBe(400);
    expect((await signedPost("/n8n/reminder-runs", { executionId: "e", runDate: "2026-11-05", found: -1, sent: 0, skipped: 0, duplicates: 0, failed: 0, durationMs: 0 })).status).toBe(400);
    expect(await counts()).toEqual({ deliveries: 0, attempts: 0, runs: 0, errors: 0 });
  });

  test("unknown loan → 404", async () => {
    await overdue();
    const res = await signedPost("/n8n/deliveries", { ...writeBack, idempotencyKey: "reminder:L-9999:2026-11-05" });
    expect(res.status).toBe(404);
  });
});
