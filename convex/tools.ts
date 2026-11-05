import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { computeAvailability, bookedRanges, isAvailableNow } from "../lib/domain/availability";
import {
  TOOL_LIMITS,
  isCategory,
  isCondition,
  type Category,
  type Condition,
} from "../lib/domain/categories";
import type {
  MyListingDTO,
  PublicToolDTO,
  ToolCardDTO,
  ToolDetailDTO,
  ToolEditDTO,
} from "../lib/domain/dto";
import { appError, isAdmin, requireViewer } from "./lib/auth";
import { enqueueNotification } from "./lib/notify";
import { UserCache } from "./lib/people";
import { queryToday, serverToday } from "./lib/today";
import {
  currentLoan,
  deleteBlockedReason,
  isLive,
  loansForTool,
} from "./lib/toolState";

type ToolInput = { name: string; category: Category; condition: Condition; description: string };

const NAME_ERROR = `Give your tool a name (${TOOL_LIMITS.name.min}–${TOOL_LIMITS.name.max} characters).`;
const DESCRIPTION_ERROR = `Describe it in ${TOOL_LIMITS.description.min}–${TOOL_LIMITS.description.max} characters.`;

/** Server-side form validation; the first failing field is reported so the form can focus it. */
function validateToolInput(raw: { name: string; category: string; condition: string; description: string }): ToolInput {
  const name = raw.name.trim();
  const description = raw.description.trim();
  if (name.length < TOOL_LIMITS.name.min || name.length > TOOL_LIMITS.name.max) {
    throw appError("VALIDATION", NAME_ERROR, "name");
  }
  if (!isCategory(raw.category)) throw appError("VALIDATION", "Pick a category.", "category");
  if (!isCondition(raw.condition)) throw appError("VALIDATION", "Pick a condition.", "condition");
  if (description.length < TOOL_LIMITS.description.min || description.length > TOOL_LIMITS.description.max) {
    throw appError("VALIDATION", DESCRIPTION_ERROR, "description");
  }
  return { name, category: raw.category, condition: raw.condition, description };
}

const toolInputArgs = {
  name: v.string(),
  category: v.string(),
  condition: v.string(),
  description: v.string(),
};

/** Resolves a client-supplied id string; malformed ids read as "not found" instead of a validator error. */
async function findTool(ctx: QueryCtx, toolId: string): Promise<Doc<"tools"> | null> {
  const id = ctx.db.normalizeId("tools", toolId);
  return id ? await ctx.db.get("tools", id) : null;
}

/** Owner-only access to a live listing. Admins do NOT edit other people's listings. */
async function requireOwnTool(ctx: QueryCtx | MutationCtx, toolId: string) {
  const viewer = await requireViewer(ctx);
  const tool = await findTool(ctx, toolId);
  if (!tool || !isLive(tool)) throw appError("NOT_FOUND");
  if (tool.ownerId !== viewer._id) throw appError("FORBIDDEN", "You can only edit your own listings.");
  return { viewer, tool };
}

async function card(
  ctx: QueryCtx,
  tool: Doc<"tools">,
  viewer: Doc<"users">,
  users: UserCache,
  today: string,
  loans?: Doc<"loans">[],
): Promise<ToolCardDTO> {
  const toolLoans = loans ?? (await loansForTool(ctx, tool._id));
  const isOwner = tool.ownerId === viewer._id;
  return {
    _id: tool._id,
    name: tool.name,
    category: tool.category,
    condition: tool.condition,
    description: tool.description,
    owner: await users.person(tool.ownerId),
    // Only the owner and admins see "Overdue"; everyone else sees "On loan".
    availability: computeAvailability(toolLoans, today, {
      removed: !isLive(tool),
      privileged: isOwner || isAdmin(viewer),
    }),
    isOwner,
    createdAt: tool.createdAt,
  };
}

/**
 * Public landing grid. No auth, so it projects to exactly {_id, name, category}:
 * no owner, description or availability details ever leave the server here.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx): Promise<PublicToolDTO[]> => {
    const today = await queryToday(ctx);
    const out: PublicToolDTO[] = [];
    for (const tool of await ctx.db.query("tools").collect()) {
      if (!isLive(tool)) continue;
      const availability = computeAvailability(await loansForTool(ctx, tool._id), today, {
        removed: false,
        privileged: false,
      });
      if (isAvailableNow(availability)) out.push({ _id: tool._id, name: tool.name, category: tool.category });
    }
    return out;
  },
});

export const list = query({
  args: {},
  handler: async (ctx): Promise<ToolCardDTO[]> => {
    const viewer = await requireViewer(ctx);
    const today = await queryToday(ctx);
    const users = new UserCache(ctx);
    const tools = (await ctx.db.query("tools").collect()).filter(isLive);
    return await Promise.all(tools.map((t) => card(ctx, t, viewer, users, today)));
  },
});

export const get = query({
  args: { toolId: v.string() },
  handler: async (ctx, { toolId }): Promise<ToolDetailDTO> => {
    const viewer = await requireViewer(ctx);
    const tool = await findTool(ctx, toolId);
    if (!tool || !isLive(tool)) throw appError("NOT_FOUND");

    const today = await queryToday(ctx);
    const users = new UserCache(ctx);
    const loans = await loansForTool(ctx, tool._id);
    const base = await card(ctx, tool, viewer, users, today, loans);
    const isOwner = base.isOwner;
    const admin = isAdmin(viewer);

    const owner = await users.get(tool.ownerId);
    const ownerLoans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", tool.ownerId))
      .collect();
    const loansCompleted =
      (owner?.loansCompletedBaseline ?? 0) + ownerLoans.filter((l) => l.status === "returned").length;

    const blocked = isOwner ? deleteBlockedReason(loans, today) : null;
    const mine = loans.find((l) => l.borrowerId === viewer._id && l.status === "pending");

    const pendingRequests = isOwner
      ? await Promise.all(
          loans
            .filter((l) => l.status === "pending")
            .sort((a, b) => a.createdAt - b.createdAt)
            .map(async (l) => ({
              loanId: l._id,
              ref: l.ref,
              borrower: await users.person(l.borrowerId),
              startDate: l.startDate,
              endDate: l.endDate,
              createdAt: l.createdAt,
            })),
        )
      : null;

    return {
      ...base,
      ownerStats: { lendingSince: owner?.joinedAt ?? tool.createdAt, loansCompleted },
      bookedRanges: bookedRanges(loans, today),
      viewer: {
        isOwner,
        isAdmin: admin,
        canRequest: !isOwner,
        canEdit: isOwner,
        canDelete: isOwner && blocked === null,
        deleteBlockedReason: blocked,
        canRemove: admin && !isOwner,
      },
      myPendingRequest: mine
        ? { loanId: mine._id, ref: mine.ref, startDate: mine.startDate, endDate: mine.endDate }
        : null,
      pendingRequests,
    };
  },
});

export const getForEdit = query({
  args: { toolId: v.string() },
  handler: async (ctx, { toolId }): Promise<ToolEditDTO> => {
    const { tool } = await requireOwnTool(ctx, toolId);
    const loans = await loansForTool(ctx, tool._id);
    return {
      _id: tool._id,
      name: tool.name,
      category: tool.category,
      condition: tool.condition,
      description: tool.description,
      hasActiveLoan: currentLoan(loans, await queryToday(ctx)) !== null,
    };
  },
});

export const create = mutation({
  args: toolInputArgs,
  handler: async (ctx, args): Promise<Id<"tools">> => {
    const viewer = await requireViewer(ctx);
    const input = validateToolInput(args);
    const now = Date.now();
    // ownerId always comes from the server-side identity, never from args.
    return await ctx.db.insert("tools", { ...input, ownerId: viewer._id, createdAt: now, updatedAt: now });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolInputArgs },
  handler: async (ctx, { toolId, ...rest }): Promise<null> => {
    const { tool } = await requireOwnTool(ctx, toolId);
    const input = validateToolInput(rest);
    await ctx.db.patch("tools", tool._id, { ...input, updatedAt: Date.now() });
    return null;
  },
});

/**
 * Owner delete. Soft, so loan history keeps the tool's name. Blocked while the
 * tool is lent out or has an approved booking; open requests are cancelled and
 * their borrowers notified.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }): Promise<null> => {
    const viewer = await requireViewer(ctx);
    const tool = await ctx.db.get("tools", toolId);
    if (!tool || tool.deletedAt !== undefined) throw appError("NOT_FOUND");
    if (tool.ownerId !== viewer._id) throw appError("FORBIDDEN", "You can only delete your own listings.");

    const today = serverToday();
    const loans = await loansForTool(ctx, tool._id);
    const blocked = deleteBlockedReason(loans, today);
    if (blocked) throw appError("HAS_ACTIVE_LOAN", blocked);

    const now = Date.now();
    for (const loan of loans.filter((l) => l.status === "pending")) {
      await ctx.db.patch("loans", loan._id, { status: "cancelled", cancelledBy: "listing_deleted", cancelledAt: now });
      await ctx.db.insert("loanEvents", { loanId: loan._id, type: "cancelled", at: now, detail: "listing deleted" });
      await enqueueNotification(ctx, { ...loan, status: "cancelled" }, "cancelled", "borrower");
    }
    await ctx.db.patch("tools", tool._id, { deletedAt: now, updatedAt: now });
    return null;
  },
});

export const myListings = query({
  args: {},
  handler: async (ctx): Promise<MyListingDTO[]> => {
    const viewer = await requireViewer(ctx);
    const today = await queryToday(ctx);
    const users = new UserCache(ctx);
    const tools = (
      await ctx.db
        .query("tools")
        .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
        .collect()
    ).filter((t) => t.deletedAt === undefined);

    const rows = await Promise.all(
      tools.map(async (tool): Promise<MyListingDTO> => {
        const loans = await loansForTool(ctx, tool._id);
        const current = currentLoan(loans, today);
        const lastReturned = loans
          .filter((l) => l.status === "returned")
          .map((l) => l.returnedOn ?? l.endDate)
          .sort()
          .at(-1);
        const blocked = deleteBlockedReason(loans, today);
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          availability: computeAvailability(loans, today, { removed: !!tool.removed, privileged: true }),
          pendingCount: loans.filter((l) => l.status === "pending").length,
          currentLoan: current
            ? {
                ref: current.ref,
                borrowerName: (await users.name(current.borrowerId)) ?? "",
                endDate: current.endDate,
                returnReported: current.returnReportedAt !== undefined,
              }
            : null,
          lastLentOn: lastReturned ?? null,
          canDelete: blocked === null,
          deleteBlockedReason: blocked,
          // The remover's identity is deliberately not sent to the owner.
          removed: tool.removed
            ? { at: tool.removed.at, reason: tool.removed.reason, detail: tool.removed.detail ?? null }
            : null,
        };
      }),
    );
    // Live listings first, removed ones (dimmed in the UI) last.
    return rows.sort((a, b) => Number(!!a.removed) - Number(!!b.removed));
  },
});
