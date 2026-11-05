/// <reference types="vite/client" />
// Shared fixtures for convex-test. The double-dot filename keeps Convex from
// bundling this as a function module.
import { convexTest } from "convex-test";
import { vi } from "vitest";
import schema from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

export const modules = import.meta.glob("./**/*.*s");

/** Brief "today": Thu Nov 5, 2026, 09:45 in Asia/Jakarta (UTC+7). */
export const TODAY = "2026-11-05";
export const NOW = new Date("2026-11-05T02:45:00Z");

export function freezeTime() {
  // Fake timers also keep scheduled sends from running unless a test drains them.
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

export function newTest() {
  return convexTest(schema, modules);
}
export type T = ReturnType<typeof newTest>;

export type Key = "maya" | "rina" | "sam" | "ayu";

export const identity = (key: Key) => ({
  tokenIdentifier: `test|${key}`,
  subject: key,
  issuer: "test",
  email: `${key}@example.com`,
  emailVerified: true,
});

export const as = (t: T, key: Key) => t.withIdentity(identity(key));

export type Fixture = {
  users: Record<Key, Id<"users">>;
  drill: Id<"tools">; // Rina's
  trimmer: Id<"tools">; // Rina's
  ladder: Id<"tools">; // Maya's
  truck: Id<"tools">; // Ayu's (admin's own listing)
};

/** Four signed-up users (Ayu is admin) and a few listings. */
export async function seedFixture(t: T): Promise<Fixture> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const user = (key: Key, name: string, role: "user" | "admin" = "user") =>
      ctx.db.insert("users", {
        tokenIdentifier: `test|${key}`,
        name,
        firstName: name.split(" ")[0]!,
        email: `${key}@example.com`,
        role,
        trusted: false,
        joinedAt: now,
      });
    const users = {
      maya: await user("maya", "Maya L."),
      rina: await user("rina", "Rina S."),
      sam: await user("sam", "Sam R."),
      ayu: await user("ayu", "Ayu W.", "admin"),
    };
    const tool = (ownerId: Id<"users">, name: string, category: Doc<"tools">["category"]) =>
      ctx.db.insert("tools", {
        ownerId,
        name,
        category,
        condition: "good",
        description: "A perfectly good tool for testing.",
        createdAt: now,
        updatedAt: now,
      });
    return {
      users,
      drill: await tool(users.rina, "Bosch cordless drill 18V", "power"),
      trimmer: await tool(users.rina, "Hedge trimmer", "garden"),
      ladder: await tool(users.maya, "6-ft step ladder", "ladders"),
      truck: await tool(users.ayu, "Folding hand truck", "ladders"),
    };
  });
}

let refCounter = 2000;

/** Inserts a loan directly (bypassing request/approve) to set up a given state. */
export async function insertLoan(
  t: T,
  loan: {
    toolId: Id<"tools">;
    ownerId: Id<"users">;
    borrowerId: Id<"users">;
    startDate: string;
    endDate: string;
    status: Doc<"loans">["status"];
    ref?: string;
  },
): Promise<{ loanId: Id<"loans">; ref: string }> {
  const ref = loan.ref ?? `L-${refCounter++}`;
  const loanId = await t.run((ctx) => ctx.db.insert("loans", { ...loan, ref, createdAt: Date.now() }));
  return { loanId, ref };
}
