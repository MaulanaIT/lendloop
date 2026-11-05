import type { QueryCtx } from "../_generated/server";
import { DEFAULT_TIME_ZONE, todayISO, type ISODate } from "../../lib/domain/dates";

/** The neighborhood timezone. Must match NEXT_PUBLIC_APP_TIME_ZONE in the web app. */
export function appTimeZone(): string {
  return process.env.APP_TIME_ZONE || DEFAULT_TIME_ZONE;
}

/**
 * "Today" as the server sees it. Every status derivation (overdue, on loan…)
 * and date validation uses this, never a date sent by the client.
 * Mutations and HTTP actions call it directly; queries use queryToday().
 */
export function serverToday(nowMs: number = Date.now()): ISODate {
  return todayISO(nowMs, appTimeZone());
}

/**
 * `Date.now()` for a query. Convex re-runs a cached query only when a document
 * it read changes, never because time passed, so a query that derives
 * "overdue" or a 24h window also reads the clock row that convex/clock.ts
 * bumps every hour. That tick is what makes midnight flip on-loan to overdue
 * for open subscriptions.
 */
export async function queryNow(ctx: QueryCtx): Promise<number> {
  await ctx.db.query("clock").first();
  return Date.now();
}

export async function queryToday(ctx: QueryCtx): Promise<ISODate> {
  return serverToday(await queryNow(ctx));
}
