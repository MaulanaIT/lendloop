import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  RETRY_BACKOFF_MS,
  resendCheck,
  type ErrorCategory,
  type NotificationPayload,
} from "../lib/domain/automation";
import { IDEMPOTENCY_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, signPayload } from "../lib/domain/signing";
import { serverToday } from "./lib/today";
import { vErrorCategory } from "./lib/validators";

// Outbound pipeline: a business mutation inserts a `deliveries` row and
// schedules `send` (see lib/notify.ts). `send` builds the minimized payload,
// signs it and POSTs it to the n8n request webhook, retrying with backoff.
// n8n later writes the final outcome back through convex/http.ts.

const SEND_TIMEOUT_MS = 10_000;

/**
 * The minimized payload: exactly FIELDS_SENT plus the idempotency key and
 * attempt number. No descriptions, conditions, user IDs or the other party's
 * email. `skip` when there's nothing to send (already sent / in flight);
 * `superseded` when the loan moved on since the event (resendCheck), so a
 * late retry never emails a request that was already cancelled.
 */
export const payload = internalQuery({
  // `today` comes from the action: a query's own clock isn't part of its cache key.
  args: { deliveryId: v.id("deliveries"), today: v.string() },
  handler: async (
    ctx,
    { deliveryId, today },
  ): Promise<{ kind: "send"; payload: NotificationPayload } | { kind: "superseded" } | { kind: "skip" }> => {
    const d = await ctx.db.get("deliveries", deliveryId);
    if (!d || (d.status !== "queued" && d.status !== "retrying")) return { kind: "skip" };
    const loan = await ctx.db.get("loans", d.loanId);
    if (!resendCheck(d, loan, today).ok) return { kind: "superseded" };
    const tool = await ctx.db.get("tools", loan!.toolId);
    const recipient = await ctx.db.get("users", d.recipientRole === "owner" ? loan!.ownerId : loan!.borrowerId);
    // Left queued; expireStale turns it into a visible failure.
    if (!recipient) return { kind: "skip" };
    return {
      kind: "send",
      payload: {
        idempotencyKey: d.idempotencyKey,
        attempt: d.attempts + 1,
        event: d.event,
        loanId: loan!.ref,
        toolName: tool?.name ?? "Deleted listing",
        startDate: loan!.startDate,
        endDate: loan!.endDate,
        recipientRole: d.recipientRole,
        recipientFirstName: recipient.firstName,
        recipientEmail: recipient.email, // the recipient's own address, nobody else's
      },
    };
  },
});

/**
 * Closes a delivery the loan has moved past without sending it. Re-checked
 * here because the loan may change between the payload read and this write.
 * Final "failed · superseded": admins see why, users and failed24h don't.
 */
export const supersede = internalMutation({
  args: { deliveryId: v.id("deliveries") },
  handler: async (ctx, { deliveryId }): Promise<null> => {
    const d = await ctx.db.get("deliveries", deliveryId);
    if (!d || (d.status !== "queued" && d.status !== "retrying")) return null;
    if (resendCheck(d, await ctx.db.get("loans", d.loanId), serverToday()).ok) {
      await ctx.scheduler.runAfter(0, internal.notifications.send, { deliveryId });
      return null;
    }
    console.log(`[notify] ${d.idempotencyKey} superseded`);
    await ctx.db.patch("deliveries", d._id, {
      status: "failed",
      lastErrorCategory: "superseded",
      nextRetryAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Worst legitimate wait is about 1 min (10 s send + 2×5 s SMTP + 3×10 s write-back tries). */
export const STALE_MS = 15 * 60_000;

/**
 * Sweeper (convex/crons.ts). A delivery that n8n accepted but never wrote back
 * (n8n restarted mid-run, its write-back and error report both failed), or a
 * queued/retrying one whose send never ran, would otherwise wait forever:
 * "Notifying owner…" for the user, nothing for the admin. After STALE_MS it
 * becomes failed · timeout, so it counts in failed24h and can be retried.
 */
export const expireStale = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const cutoff = now - STALE_MS;
    let expired = 0;
    for (const status of ["accepted", "queued", "retrying"] as const) {
      const rows = await ctx.db
        .query("deliveries")
        .withIndex("by_status", (q) => q.eq("status", status).lt("updatedAt", cutoff))
        .collect();
      for (const d of rows) {
        // A retry that is due soon (or just ran late) still gets its chance.
        if (status === "retrying" && d.nextRetryAt !== undefined && d.nextRetryAt > cutoff) continue;
        await ctx.db.patch("deliveries", d._id, {
          status: "failed",
          lastErrorCategory: "timeout",
          nextRetryAt: undefined,
          updatedAt: now,
        });
        await ctx.db.insert("deliveryAttempts", {
          deliveryId: d._id,
          idempotencyKey: d.idempotencyKey,
          attempt: Math.max(d.attempts, 1),
          outcome: "failed",
          errorCategory: "timeout",
          executionId: d.executionId,
          source: "convex",
          final: true,
          at: now,
        });
        console.warn(`[notify] ${d.idempotencyKey} expired status=${status} category=timeout`);
        expired++;
      }
    }
    return expired;
  },
});

/**
 * Records one outbound attempt and moves the delivery on: accepted, retrying
 * (re-scheduled with backoff) or failed. A write-back that already marked the
 * delivery "sent" is never downgraded by a slower HTTP response.
 */
export const recordAttempt = internalMutation({
  args: {
    deliveryId: v.id("deliveries"),
    attempt: v.number(),
    outcome: v.union(v.literal("accepted"), v.literal("failed")),
    errorCategory: v.optional(vErrorCategory),
    executionId: v.optional(v.string()),
    /** Don't retry (e.g. not configured): retrying can't succeed. */
    final: v.optional(v.boolean()),
  },
  handler: async (ctx, a): Promise<null> => {
    const d = await ctx.db.get("deliveries", a.deliveryId);
    if (!d) return null;
    const now = Date.now();
    const attemptId = await ctx.db.insert("deliveryAttempts", {
      deliveryId: d._id,
      idempotencyKey: d.idempotencyKey,
      attempt: a.attempt,
      outcome: a.outcome,
      errorCategory: a.errorCategory,
      executionId: a.executionId,
      source: "convex",
      at: now,
    });

    const attempts = Math.max(d.attempts, a.attempt);
    // n8n's write-back can land before this HTTP response is recorded; its
    // final outcome (sent, or failed after n8n's own retries) wins.
    if (d.status === "sent" || (a.outcome === "accepted" && d.status === "failed")) {
      await ctx.db.patch("deliveries", d._id, { attempts, executionId: d.executionId ?? a.executionId });
      return null;
    }
    if (a.outcome === "accepted") {
      await ctx.db.patch("deliveries", d._id, {
        status: "accepted",
        attempts,
        executionId: a.executionId ?? d.executionId,
        nextRetryAt: undefined,
        lastErrorCategory: undefined,
        updatedAt: now,
      });
      return null;
    }

    if (!a.final && attempts < d.maxAttempts) {
      const delay = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)] ?? RETRY_BACKOFF_MS[0];
      await ctx.db.patch("deliveries", d._id, {
        status: "retrying",
        attempts,
        lastErrorCategory: a.errorCategory,
        nextRetryAt: now + delay,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(delay, internal.notifications.send, { deliveryId: d._id });
    } else {
      await ctx.db.patch("deliveryAttempts", attemptId, { final: true });
      await ctx.db.patch("deliveries", d._id, {
        status: "failed",
        attempts,
        lastErrorCategory: a.errorCategory,
        nextRetryAt: undefined,
        updatedAt: now,
      });
    }
    return null;
  },
});

// n8n's webhook answers 202 {accepted, executionId}, 401 {error:"invalid_signature"}
// or 400 {error:"invalid_payload"}; 404 means the workflow isn't published (yet).
function categoryForStatus(status: number): ErrorCategory {
  if (status === 401 || status === 403) return "signature_rejected";
  if (status >= 500) return "upstream_5xx";
  return "upstream_4xx";
}

/** The same payload will be rejected again, so retrying can't help. */
function isPermanent(status: number): boolean {
  return status === 400 || status === 413 || status === 422;
}

async function readExecutionId(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    const id = (body as { executionId?: unknown } | null)?.executionId;
    if (typeof id === "string" && /^[\w.:-]{1,100}$/.test(id)) return id;
    if (typeof id === "number" && Number.isFinite(id)) return String(id);
  } catch {
    // n8n may answer with an empty body; the execution id is optional.
  }
  return undefined;
}

export const send = internalAction({
  args: { deliveryId: v.id("deliveries") },
  handler: async (ctx, { deliveryId }): Promise<null> => {
    const next = await ctx.runQuery(internal.notifications.payload, { deliveryId, today: serverToday() });
    if (next.kind === "skip") return null;
    if (next.kind === "superseded") {
      await ctx.runMutation(internal.notifications.supersede, { deliveryId });
      return null;
    }
    const { payload } = next;
    const { idempotencyKey, attempt } = payload;

    const url = process.env.N8N_REQUEST_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!url || !secret) {
      console.warn(`[notify] ${idempotencyKey} not_configured`);
      await ctx.runMutation(internal.notifications.recordAttempt, {
        deliveryId,
        attempt,
        outcome: "failed",
        errorCategory: "not_configured",
        final: true,
      });
      return null;
    }

    // Sign the exact bytes we send; n8n verifies `${timestamp}.${rawBody}`.
    const body = JSON.stringify(payload);
    const { timestamp, signature } = await signPayload(secret, body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    let outcome: { ok: true; executionId?: string } | { ok: false; category: ErrorCategory; final?: boolean };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signature,
          [IDEMPOTENCY_HEADER]: idempotencyKey,
        },
        body,
        signal: controller.signal,
      });
      outcome = res.ok
        ? { ok: true, executionId: await readExecutionId(res) }
        : { ok: false, category: categoryForStatus(res.status), final: isPermanent(res.status) };
    } catch (err) {
      outcome = { ok: false, category: controller.signal.aborted || (err as Error)?.name === "AbortError" ? "timeout" : "network" };
    } finally {
      clearTimeout(timer);
    }

    // Logs carry the key and category only, never payload values or secrets.
    if (outcome.ok) {
      console.log(`[notify] ${idempotencyKey} accepted attempt=${attempt}`);
      await ctx.runMutation(internal.notifications.recordAttempt, {
        deliveryId,
        attempt,
        outcome: "accepted",
        executionId: outcome.executionId,
      });
    } else {
      console.warn(`[notify] ${idempotencyKey} failed attempt=${attempt} category=${outcome.category}`);
      await ctx.runMutation(internal.notifications.recordAttempt, {
        deliveryId,
        attempt,
        outcome: "failed",
        errorCategory: outcome.category,
        final: outcome.final,
      });
    }
    return null;
  },
});
