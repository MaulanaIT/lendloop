import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { as, freezeTime, insertLoan, newTest, seedFixture, type T } from "./test.helpers";

/** Runs `fn` and returns the ConvexError code it threw. */
async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return (err as { data?: { code?: string } }).data?.code ?? `non-app error: ${String(err)}`;
  }
  return "no error";
}

let t: T;
beforeEach(() => {
  freezeTime();
  t = newTest();
});
afterEach(() => {
  vi.useRealTimers();
});

const toolInput = {
  name: "Orbital sander",
  category: "power",
  condition: "good",
  description: "Random orbit, with a dust bag and spare pads.",
};

describe("users.store", () => {
  test("links a seeded row on a verified email, ignoring +clerk_test", async () => {
    const seeded = await t.run((ctx) =>
      ctx.db.insert("users", {
        name: "Maya L.",
        firstName: "Maya",
        email: "maya.l@example.com",
        role: "admin",
        trusted: true,
        joinedAt: 0,
      }),
    );
    const id = await t
      .withIdentity({ tokenIdentifier: "clerk|1", email: "Maya.L+clerk_test@example.com", emailVerified: true })
      .mutation(api.users.store, {});
    expect(id).toBe(seeded);
  });

  test("does not link on an unverified email and always creates a plain user", async () => {
    const seeded = await t.run((ctx) =>
      ctx.db.insert("users", { name: "Ayu W.", firstName: "Ayu", email: "ayu.w@example.com", role: "admin", trusted: false, joinedAt: 0 }),
    );
    const attacker = t.withIdentity({
      tokenIdentifier: "clerk|evil",
      email: "ayu.w@example.com",
      emailVerified: false,
      givenName: "Eve",
      familyName: "Mallory",
    });
    const id = await attacker.mutation(api.users.store, {});
    expect(id).not.toBe(seeded);
    const me = await attacker.query(api.users.me, {});
    expect(me).toMatchObject({ name: "Eve M.", role: "user", trusted: false });
    // Idempotent on the second call.
    expect(await attacker.mutation(api.users.store, {})).toBe(id);
  });

  test("store requires an identity", async () => {
    expect(await codeOf(() => t.mutation(api.users.store, {}))).toBe("UNAUTHENTICATED");
  });

  test("setRole is internal-only and changes the role", async () => {
    const f = await seedFixture(t);
    await t.mutation(internal.users.setRole, { email: "SAM@example.com", role: "admin" });
    expect((await as(t, "sam").query(api.users.me, {}))?.role).toBe("admin");
    expect(f.users.sam).toBeDefined();
  });
});

describe("tools RBAC", () => {
  test("a user cannot getForEdit / update / delete someone else's tool", async () => {
    const f = await seedFixture(t);
    const maya = as(t, "maya");
    expect(await codeOf(() => maya.query(api.tools.getForEdit, { toolId: f.drill }))).toBe("FORBIDDEN");
    expect(await codeOf(() => maya.mutation(api.tools.update, { toolId: f.drill, ...toolInput }))).toBe("FORBIDDEN");
    expect(await codeOf(() => maya.mutation(api.tools.remove, { toolId: f.drill }))).toBe("FORBIDDEN");
  });

  test("admins do not edit other people's listings either", async () => {
    const f = await seedFixture(t);
    const ayu = as(t, "ayu");
    expect(await codeOf(() => ayu.query(api.tools.getForEdit, { toolId: f.drill }))).toBe("FORBIDDEN");
    expect(await codeOf(() => ayu.mutation(api.tools.update, { toolId: f.drill, ...toolInput }))).toBe("FORBIDDEN");
  });

  test("owners can create, edit and delete their own listings; ownerId comes from the server", async () => {
    await seedFixture(t);
    const maya = as(t, "maya");
    const id = await maya.mutation(api.tools.create, { ...toolInput, name: "  Orbital sander  " });
    const edit = await maya.query(api.tools.getForEdit, { toolId: id });
    expect(edit.name).toBe("Orbital sander");
    await maya.mutation(api.tools.update, { toolId: id, ...toolInput, condition: "fair" });
    expect((await maya.query(api.tools.get, { toolId: id })).condition).toBe("fair");
    await maya.mutation(api.tools.remove, { toolId: id });
    expect(await codeOf(() => maya.query(api.tools.get, { toolId: id }))).toBe("NOT_FOUND");
  });

  test("validation errors name the field", async () => {
    await seedFixture(t);
    const maya = as(t, "maya");
    const err = async (patch: Record<string, string>) => {
      try {
        await maya.mutation(api.tools.create, { ...toolInput, ...patch });
      } catch (e) {
        return (e as { data: { code: string; field?: string } }).data;
      }
      return null;
    };
    expect(await err({ name: "ab" })).toMatchObject({ code: "VALIDATION", field: "name" });
    expect(await err({ category: "weapons" })).toMatchObject({ code: "VALIDATION", field: "category" });
    expect(await err({ condition: "mint" })).toMatchObject({ code: "VALIDATION", field: "condition" });
    expect(await err({ description: "short" })).toMatchObject({ code: "VALIDATION", field: "description" });
  });

  test("tools.get is NOT_FOUND for removed, deleted and malformed ids", async () => {
    const f = await seedFixture(t);
    await as(t, "ayu").mutation(api.admin.removeListing, { toolId: f.trimmer, reason: "Spam" });
    const maya = as(t, "maya");
    expect(await codeOf(() => maya.query(api.tools.get, { toolId: f.trimmer }))).toBe("NOT_FOUND");
    expect(await codeOf(() => maya.query(api.tools.get, { toolId: "not-an-id" }))).toBe("NOT_FOUND");
  });

  test("delete is blocked while lent out", async () => {
    const f = await seedFixture(t);
    await insertLoan(t, { toolId: f.ladder, ownerId: f.users.maya, borrowerId: f.users.sam, startDate: "2026-11-04", endDate: "2026-11-06", status: "approved" });
    expect(await codeOf(() => as(t, "maya").mutation(api.tools.remove, { toolId: f.ladder }))).toBe("HAS_ACTIVE_LOAN");
  });

  test("anonymous callers only reach listPublic", async () => {
    await seedFixture(t);
    expect(await codeOf(() => t.query(api.tools.list, {}))).toBe("UNAUTHENTICATED");
    expect(await codeOf(() => t.mutation(api.tools.create, toolInput))).toBe("UNAUTHENTICATED");
  });
});

describe("tools.listPublic", () => {
  test("returns exactly {_id, name, category} for available tools only", async () => {
    const f = await seedFixture(t);
    // Drill is on loan today, trimmer is removed, ladder only has a future booking (still available).
    await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-01", endDate: "2026-11-03", status: "approved" });
    await insertLoan(t, { toolId: f.ladder, ownerId: f.users.maya, borrowerId: f.users.sam, startDate: "2026-11-08", endDate: "2026-11-09", status: "approved" });
    await as(t, "ayu").mutation(api.admin.removeListing, { toolId: f.trimmer, reason: "Duplicate" });

    const tools = await t.query(api.tools.listPublic, {});
    expect(tools.map((x) => x.name).sort()).toEqual(["6-ft step ladder", "Folding hand truck"]);
    for (const tool of tools) expect(Object.keys(tool).sort()).toEqual(["_id", "category", "name"]);
  });

  test("non-owners see an overdue tool as plain 'On loan'; owner and admin see overdue", async () => {
    const f = await seedFixture(t);
    await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-10-31", endDate: "2026-11-03", status: "approved" });
    const availability = async (key: "sam" | "rina" | "ayu") =>
      (await as(t, key).query(api.tools.get, { toolId: f.drill })).availability;
    expect(await availability("sam")).toEqual({ kind: "on_loan", until: null });
    expect(await availability("rina")).toEqual({ kind: "overdue", days: 2 });
    expect(await availability("ayu")).toEqual({ kind: "overdue", days: 2 });
  });
});

describe("loans RBAC", () => {
  test("non-party loans.get / timeline → NOT_FOUND; admin gets a read-only view", async () => {
    const f = await seedFixture(t);
    const { loanId, ref } = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-08", endDate: "2026-11-09", status: "pending" });
    const sam = as(t, "sam");
    expect(await codeOf(() => sam.query(api.loans.get, { ref }))).toBe("NOT_FOUND");
    expect(await codeOf(() => sam.query(api.loans.timeline, { loanId }))).toBe("NOT_FOUND");
    expect(await codeOf(() => sam.query(api.loans.get, { ref: "L-9999" }))).toBe("NOT_FOUND");

    const adminView = await as(t, "ayu").query(api.loans.get, { ref });
    expect(adminView.adminView).toBe(true);
    expect(adminView.viewerRole).toBe("admin");
    expect(Object.values(adminView.actions).every((v) => v === false)).toBe(true);
  });

  test("can't request your own tool", async () => {
    const f = await seedFixture(t);
    expect(
      await codeOf(() => as(t, "maya").mutation(api.loans.request, { toolId: f.ladder, startDate: "2026-11-10", endDate: "2026-11-11" })),
    ).toBe("OWN_TOOL");
  });

  test("admin cannot approve / decline / markReturned other people's loans", async () => {
    const f = await seedFixture(t);
    const pending = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-08", endDate: "2026-11-09", status: "pending" });
    const onLoan = await insertLoan(t, { toolId: f.trimmer, ownerId: f.users.rina, borrowerId: f.users.sam, startDate: "2026-11-04", endDate: "2026-11-06", status: "approved" });
    const ayu = as(t, "ayu");
    expect(await codeOf(() => ayu.mutation(api.loans.approve, { loanId: pending.loanId }))).toBe("FORBIDDEN");
    expect(await codeOf(() => ayu.mutation(api.loans.decline, { loanId: pending.loanId }))).toBe("FORBIDDEN");
    expect(await codeOf(() => ayu.mutation(api.loans.markReturned, { loanId: onLoan.loanId }))).toBe("FORBIDDEN");
  });

  test("non-party users get NOT_FOUND on actions; the borrower can't approve or mark returned", async () => {
    const f = await seedFixture(t);
    const pending = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-08", endDate: "2026-11-09", status: "pending" });
    const onLoan = await insertLoan(t, { toolId: f.trimmer, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-04", endDate: "2026-11-06", status: "approved" });
    expect(await codeOf(() => as(t, "sam").mutation(api.loans.approve, { loanId: pending.loanId }))).toBe("NOT_FOUND");
    expect(await codeOf(() => as(t, "sam").mutation(api.loans.cancel, { loanId: pending.loanId }))).toBe("NOT_FOUND");
    const maya = as(t, "maya");
    expect(await codeOf(() => maya.mutation(api.loans.approve, { loanId: pending.loanId }))).toBe("FORBIDDEN");
    expect(await codeOf(() => maya.mutation(api.loans.markReturned, { loanId: onLoan.loanId }))).toBe("FORBIDDEN");
    // ...and the owner can't cancel the borrower's request or report a return.
    expect(await codeOf(() => as(t, "rina").mutation(api.loans.cancel, { loanId: pending.loanId }))).toBe("FORBIDDEN");
    expect(await codeOf(() => as(t, "rina").mutation(api.loans.reportReturned, { loanId: onLoan.loanId }))).toBe("FORBIDDEN");
  });

  test("contactEmail: only the counterpart, only while active, never admins", async () => {
    const f = await seedFixture(t);
    const pending = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-08", endDate: "2026-11-09", status: "pending" });
    const active = await insertLoan(t, { toolId: f.trimmer, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-10-31", endDate: "2026-11-03", status: "approved" });
    const returned = await insertLoan(t, { toolId: f.trimmer, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-10-18", endDate: "2026-10-20", status: "returned" });

    const maya = as(t, "maya");
    const rina = as(t, "rina");
    expect((await maya.query(api.loans.get, { ref: pending.ref })).contactEmail).toBeNull();
    expect((await maya.query(api.loans.get, { ref: active.ref })).contactEmail).toBe("rina@example.com");
    expect((await rina.query(api.loans.get, { ref: active.ref })).contactEmail).toBe("maya@example.com");
    expect((await maya.query(api.loans.get, { ref: returned.ref })).contactEmail).toBeNull();

    expect((await as(t, "ayu").query(api.loans.get, { ref: active.ref })).contactEmail).toBeNull();
    const adminRows = await as(t, "ayu").query(api.admin.loans, {});
    expect(adminRows.every((r) => r.contactEmail === null)).toBe(true);
    // Overdue first in the admin list.
    expect(adminRows[0]!.ref).toBe(active.ref);
  });
});

describe("admin RBAC", () => {
  test("every admin function is FORBIDDEN for regular users", async () => {
    const f = await seedFixture(t);
    const maya = as(t, "maya");
    expect(await codeOf(() => maya.query(api.admin.loans, {}))).toBe("FORBIDDEN");
    expect(await codeOf(() => maya.query(api.admin.listings, {}))).toBe("FORBIDDEN");
    expect(await codeOf(() => maya.query(api.admin.users, {}))).toBe("FORBIDDEN");
    expect(await codeOf(() => maya.query(api.admin.automation, {}))).toBe("FORBIDDEN");
    expect(await codeOf(() => maya.mutation(api.admin.removeListing, { toolId: f.drill, reason: "Spam" }))).toBe("FORBIDDEN");
    expect(await codeOf(() => maya.mutation(api.admin.setTrusted, { userId: f.users.rina, trusted: true }))).toBe("FORBIDDEN");
    const deliveryId = await t.run(async (ctx) => {
      const { loanId } = { loanId: await ctx.db.insert("loans", { ref: "L-3000", toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-08", endDate: "2026-11-09", status: "pending", createdAt: 0 }) };
      return await ctx.db.insert("deliveries", { idempotencyKey: "notify:L-3000:requested", kind: "notification", event: "requested", loanId, recipientRole: "owner", status: "failed", attempts: 3, maxAttempts: 3, fieldsSent: [], signed: true, createdAt: 0, updatedAt: 0 });
    });
    expect(await codeOf(() => maya.mutation(api.admin.retryDelivery, { deliveryId }))).toBe("FORBIDDEN");
  });

  test("setTrusted: not for yourself; records who granted it", async () => {
    const f = await seedFixture(t);
    const ayu = as(t, "ayu");
    const err = await ayu.mutation(api.admin.setTrusted, { userId: f.users.ayu, trusted: true }).catch((e) => e.data);
    expect(err).toEqual({ code: "FORBIDDEN", message: "You can't change your own badge." });

    await ayu.mutation(api.admin.setTrusted, { userId: f.users.rina, trusted: true });
    const rina = (await ayu.query(api.admin.users, {})).find((u) => u._id === f.users.rina)!;
    expect(rina).toMatchObject({ trusted: true, trustedGrantedByName: "Ayu W.", trustedGrantedAt: NOW_MS });
    // Admin users list never includes emails.
    expect(JSON.stringify(await ayu.query(api.admin.users, {}))).not.toContain("@example.com");
  });

  test("removeListing requires a reason (and detail for Other), cancels pending + upcoming, keeps the active loan", async () => {
    const f = await seedFixture(t);
    const ayu = as(t, "ayu");
    const pending = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-20", endDate: "2026-11-21", status: "pending" });
    const upcoming = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.sam, startDate: "2026-11-10", endDate: "2026-11-11", status: "approved" });
    const active = await insertLoan(t, { toolId: f.drill, ownerId: f.users.rina, borrowerId: f.users.maya, startDate: "2026-11-01", endDate: "2026-11-03", status: "approved" });

    expect(await codeOf(() => ayu.mutation(api.admin.removeListing, { toolId: f.drill, reason: "Because" }))).toBe("VALIDATION");
    expect(await codeOf(() => ayu.mutation(api.admin.removeListing, { toolId: f.drill, reason: "Other", detail: "  " }))).toBe("VALIDATION");

    const listing = (await ayu.query(api.admin.listings, {})).find((l) => l._id === f.drill)!;
    expect(listing.impact).toEqual({ pendingCount: 1, upcomingCount: 1, activeLoan: { borrowerName: "Maya L.", overdue: true } });

    await ayu.mutation(api.admin.removeListing, { toolId: f.drill, reason: "Other", detail: "Recalled model" });
    const loans = await t.run((ctx) => Promise.all([pending, upcoming, active].map((l) => ctx.db.get("loans", l.loanId))));
    expect(loans.map((l) => [l!.status, l!.cancelledBy ?? null])).toEqual([
      ["cancelled", "listing_removed"],
      ["cancelled", "listing_removed"],
      ["approved", null],
    ]);
    const owner = await as(t, "rina").query(api.tools.myListings, {});
    expect(owner.find((l) => l._id === f.drill)!.removed).toMatchObject({ reason: "Other", detail: "Recalled model" });
  });
});

const NOW_MS = new Date("2026-11-05T02:45:00Z").getTime();
