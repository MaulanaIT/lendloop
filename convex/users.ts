import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { NavCountsDTO, ViewerDTO } from "../lib/domain/dto";
import { deriveLoanStatus } from "../lib/domain/status";
import { appError, getViewer } from "./lib/auth";
import { countFailed24h } from "./lib/automationStats";
import { displayNameFrom, normalizeEmail, toPerson } from "./lib/people";
import { queryNow, serverToday } from "./lib/today";
import { vRole } from "./lib/validators";

/**
 * Creates or links the signed-in user's row. Takes no arguments on purpose:
 * role and trust are never accepted from the client. New users are always
 * "user"; admins are seeded or promoted with the internal `setRole`.
 */
export const store = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"users">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (existing) return existing._id;

    const email = identity.email ? normalizeEmail(identity.email) : "";

    // Link a seeded / pre-provisioned row only on a *verified* email match, so
    // nobody can claim another neighbor's account (or the admin row) by
    // signing up with an unverified address.
    if (email && identity.emailVerified === true) {
      const candidates = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      const unclaimed = candidates.find((u) => u.tokenIdentifier === undefined);
      if (unclaimed) {
        await ctx.db.patch("users", unclaimed._id, { tokenIdentifier: identity.tokenIdentifier });
        return unclaimed._id;
      }
    }

    const { name, firstName } = displayNameFrom(identity);
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      firstName,
      email,
      role: "user",
      trusted: false,
      joinedAt: Date.now(),
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx): Promise<ViewerDTO | null> => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return { ...toPerson(viewer), email: viewer.email, role: viewer.role };
  },
});

export const navCounts = query({
  args: {},
  handler: async (ctx): Promise<NavCountsDTO | null> => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const now = await queryNow(ctx);
    const today = serverToday(now);

    const incomingPending = (
      await ctx.db
        .query("loans")
        .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
        .collect()
    ).filter((l) => l.status === "pending").length;

    const overdueBorrowing = (
      await ctx.db
        .query("loans")
        .withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id))
        .collect()
    ).filter((l) => deriveLoanStatus(l, today) === "overdue").length;

    return {
      incomingPending,
      overdueBorrowing,
      adminFailures24h: viewer.role === "admin" ? await countFailed24h(ctx, now) : null,
    };
  },
});

/**
 * The only way to change a role: `npx convex run users:setRole '{"email":…,"role":"admin"}'`
 * or the Convex dashboard. Internal, so no client can reach it.
 */
export const setRole = internalMutation({
  args: { email: v.string(), role: vRole },
  handler: async (ctx, { email, role }): Promise<Id<"users">> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
      .first();
    if (!user) throw appError("NOT_FOUND", `No user with email ${normalizeEmail(email)}.`);
    await ctx.db.patch("users", user._id, { role });
    return user._id;
  },
});
