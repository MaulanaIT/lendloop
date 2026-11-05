import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { AppErrorData, ErrorCode } from "../../lib/domain/errors";

// Every public function starts with one of these guards. The UI hides actions
// a role can't take, but these checks are the actual enforcement.

export function appError(code: ErrorCode, message?: string, field?: string): ConvexError<AppErrorData> {
  const data: AppErrorData = { code };
  if (message) data.message = message;
  if (field) data.field = field;
  return new ConvexError(data);
}

/** The signed-in user's row, or null for visitors / users not yet synced. */
export async function getViewer(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireViewer(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const viewer = await getViewer(ctx);
  if (!viewer) throw appError("UNAUTHENTICATED");
  return viewer;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const viewer = await requireViewer(ctx);
  if (viewer.role !== "admin") throw appError("FORBIDDEN");
  return viewer;
}

export function isAdmin(user: Doc<"users"> | null): boolean {
  return user?.role === "admin";
}
