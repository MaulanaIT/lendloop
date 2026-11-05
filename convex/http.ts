import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { ERROR_CATEGORIES, parseIdempotencyKey, type ErrorCategory } from "../lib/domain/automation";
import { isISODate } from "../lib/domain/dates";
import type { DeliveryWriteBack, ReminderRunWriteBack, WorkflowErrorReport } from "../lib/domain/dto";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from "../lib/domain/signing";
import { serverToday } from "./lib/today";

// Endpoints n8n calls. Every request must carry a valid HMAC signature made
// with CONVEX_INBOUND_SECRET over `${timestamp}.${rawBody}`. Rejected requests
// are logged (reason only) and never touch the database, so unsigned traffic
// can't be used to fill it up.

const MAX_BODY_BYTES = 16 * 1024;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

class BadRequest extends Error {}

type Handler = (ctx: ActionCtx, body: Record<string, unknown>) => Promise<Response>;

/** Wraps a handler with: config check → size limit → signature → JSON parse → shape validation. */
function signed(path: string, handler: Handler) {
  return httpAction(async (ctx, req) => {
    const secret = process.env.CONVEX_INBOUND_SECRET;
    if (!secret) {
      console.warn(`[n8n inbound] ${path} rejected: not_configured`);
      return json(503, { error: "not_configured" });
    }

    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return json(413, { error: "payload_too_large" });
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json(413, { error: "payload_too_large" });
    }

    const result = await verifySignature(
      secret,
      raw,
      req.headers.get(TIMESTAMP_HEADER),
      req.headers.get(SIGNATURE_HEADER),
    );
    if (!result.ok) {
      console.warn(`[n8n inbound] ${path} rejected: ${result.reason}`);
      return json(401, { error: "invalid_signature" });
    }

    let body: unknown;
    try {
      body = raw.trim() === "" ? {} : JSON.parse(raw);
    } catch {
      return json(400, { error: "invalid_json" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json(400, { error: "invalid_body" });
    }

    try {
      return await handler(ctx, body as Record<string, unknown>);
    } catch (err) {
      if (err instanceof BadRequest) return json(400, { error: "invalid_body", field: err.message });
      throw err;
    }
  });
}

// ─── Strict field validation (unknown fields are ignored, never stored) ──

const EXECUTION_ID_RE = /^[A-Za-z0-9_.:-]{1,100}$/;

function str(body: Record<string, unknown>, key: string, opts: { max: number; re?: RegExp }): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0 || value.length > opts.max) throw new BadRequest(key);
  if (opts.re && !opts.re.test(value)) throw new BadRequest(key);
  return value;
}

function optStr(body: Record<string, unknown>, key: string, opts: { max: number; re?: RegExp }): string | undefined {
  return body[key] === undefined || body[key] === null ? undefined : str(body, key, opts);
}

function int(body: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new BadRequest(key);
  return value;
}

function category(body: Record<string, unknown>, key: string): ErrorCategory {
  const value = body[key];
  // "superseded" is Convex's own non-failure; n8n reporting it would hide a real failure.
  if (typeof value !== "string" || value === "superseded" || !(ERROR_CATEGORIES as readonly string[]).includes(value)) {
    throw new BadRequest(key);
  }
  return value as ErrorCategory;
}

function idempotencyKey(body: Record<string, unknown>, key: string): string {
  const value = str(body, key, { max: 100 });
  if (!parseIdempotencyKey(value)) throw new BadRequest(key);
  return value;
}

function runDate(body: Record<string, unknown>): string {
  const value = body.runDate;
  if (value === undefined || value === null) return serverToday();
  if (!isISODate(value)) throw new BadRequest("runDate");
  return value;
}

const MAX_COUNT = 100_000;

// ─── Routes ──────────────────────────────────────────────────────────────

const http = httpRouter();

http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: signed("/n8n/overdue-loans", async (ctx, body) => {
    const result = await ctx.runQuery(internal.n8n.overdueLoans, { runDate: runDate(body) });
    return json(200, result);
  }),
});

http.route({
  path: "/n8n/deliveries",
  method: "POST",
  handler: signed("/n8n/deliveries", async (ctx, body) => {
    const status = body.status;
    if (status !== "sent" && status !== "failed") throw new BadRequest("status");
    const wb: DeliveryWriteBack = {
      idempotencyKey: idempotencyKey(body, "idempotencyKey"),
      status,
      // Each admin "Retry now" adds up to MAX_ATTEMPTS more.
      attempt: int(body, "attempt", 1, 1000),
      executionId: str(body, "executionId", { max: 100, re: EXECUTION_ID_RE }),
      channel: optStr(body, "channel", { max: 32, re: /^[a-z_]+$/ }),
      errorCategory: body.errorCategory === undefined || body.errorCategory === null ? undefined : category(body, "errorCategory"),
    };
    const result = await ctx.runMutation(internal.n8n.applyDeliveryWriteBack, wb);
    if (!result.ok) return json(404, { error: result.error });
    return json(200, result);
  }),
});

http.route({
  path: "/n8n/reminder-runs",
  method: "POST",
  handler: signed("/n8n/reminder-runs", async (ctx, body) => {
    const run: ReminderRunWriteBack = {
      executionId: str(body, "executionId", { max: 100, re: EXECUTION_ID_RE }),
      runDate: runDate(body),
      found: int(body, "found", 0, MAX_COUNT),
      sent: int(body, "sent", 0, MAX_COUNT),
      skipped: int(body, "skipped", 0, MAX_COUNT),
      duplicates: int(body, "duplicates", 0, MAX_COUNT),
      failed: int(body, "failed", 0, MAX_COUNT),
      durationMs: int(body, "durationMs", 0, 24 * 60 * 60 * 1000),
    };
    return json(200, await ctx.runMutation(internal.n8n.applyReminderRun, run));
  }),
});

http.route({
  path: "/n8n/errors",
  method: "POST",
  handler: signed("/n8n/errors", async (ctx, body) => {
    const report: WorkflowErrorReport = {
      executionId: str(body, "executionId", { max: 100, re: EXECUTION_ID_RE }),
      workflow: str(body, "workflow", { max: 100 }),
      node: optStr(body, "node", { max: 100 }),
      errorCategory: category(body, "errorCategory"),
      idempotencyKey:
        body.idempotencyKey === undefined || body.idempotencyKey === null
          ? undefined
          : idempotencyKey(body, "idempotencyKey"),
    };
    const result = await ctx.runMutation(internal.n8n.applyWorkflowError, report);
    return json(200, { ok: result.ok, duplicate: result.duplicate });
  }),
});

export default http;
