import { internalMutation } from "./_generated/server";

const HOUR_MS = 3_600_000;

/**
 * Hourly tick (convex/crons.ts) that queries depend on through queryNow(), so
 * derived statuses and 24h windows move on without any other write. Hourly
 * covers every whole-hour APP_TIME_ZONE midnight (Asia/Jakarta: 17:00 UTC).
 */
export const tick = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const hourMs = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    const row = await ctx.db.query("clock").first();
    if (!row) await ctx.db.insert("clock", { hourMs });
    else if (row.hourMs !== hourMs) await ctx.db.patch("clock", row._id, { hourMs });
    return null;
  },
});
