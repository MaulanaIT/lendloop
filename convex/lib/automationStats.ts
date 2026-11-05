import type { QueryCtx } from "../_generated/server";

export const DAY_MS = 86_400_000;

/**
 * Failures in the last 24h that no later retry fixed: deliveries still in
 * "failed" (a successful retry flips them to sent), crashed workflow runs
 * that aren't tied to a delivery, and reminder-run failures that never became
 * a delivery row (a write-back that didn't reach Convex). Drives the admin nav
 * badge and banner. `now` comes from queryNow() so the window slides.
 */
export async function countFailed24h(ctx: QueryCtx, now: number): Promise<number> {
  const since = now - DAY_MS;
  // "superseded" was dropped on purpose (the loan moved on), not a failure.
  const failed = (
    await ctx.db
      .query("deliveries")
      .withIndex("by_status", (q) => q.eq("status", "failed").gte("updatedAt", since))
      .collect()
  ).filter((d) => d.lastErrorCategory !== "superseded");
  const crashes = await ctx.db
    .query("workflowErrors")
    .withIndex("by_at", (q) => q.gte("at", since))
    .collect();
  const runs = (
    await ctx.db
      .query("reminderRuns")
      .withIndex("by_finished", (q) => q.gte("finishedAt", since))
      .collect()
  ).filter((r) => r.status !== "completed");
  const base = failed.length + crashes.filter((e) => !e.idempotencyKey).length;
  if (runs.length === 0) return base;

  // A failed SMTP send was written back as a failed attempt of the run's
  // execution: its delivery is counted above while still failed, and not at
  // all once a retry sent it. Only failures with no delivery row are added.
  const from = Math.min(...runs.map((r) => r.finishedAt - r.durationMs)) - 60_000;
  const attempts = await ctx.db
    .query("deliveryAttempts")
    .withIndex("by_at", (q) => q.gte("at", from))
    .collect();
  const unrecorded = runs.reduce((sum, r) => {
    const recorded = new Set(
      attempts
        .filter((a) => a.source === "n8n" && a.outcome === "failed" && a.executionId === r.executionId)
        .map((a) => a.deliveryId),
    ).size;
    return sum + Math.max(0, r.failed - recorded);
  }, 0);
  return base + unrecorded;
}
