import type { UserIdentity } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { PersonDTO } from "../../lib/domain/dto";

/** "Maya L." → "ML" */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Public projection of a user: no email, no role, no Clerk identifiers. */
export function toPerson(user: Doc<"users">): PersonDTO {
  return { _id: user._id, name: user.name, initials: initials(user.name), trusted: user.trusted };
}

/**
 * Lowercases and strips Clerk's "+clerk_test" sub-address, so the Clerk test
 * login maya.l+clerk_test@example.com links to the seeded maya.l@example.com.
 */
export function normalizeEmail(email: string): string {
  const lower = email.trim().toLowerCase();
  return lower.replace(/\+clerk_test(?=@)/, "");
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Display name "First L." plus the first name, from whatever the identity carries. */
export function displayNameFrom(identity: Pick<UserIdentity, "givenName" | "familyName" | "name" | "email">): {
  name: string;
  firstName: string;
} {
  const given = identity.givenName?.trim();
  const family = identity.familyName?.trim();
  if (given) {
    return { name: family ? `${given} ${family[0]!.toUpperCase()}.` : given, firstName: given };
  }
  const full = identity.name?.trim();
  if (full) {
    const parts = full.split(/\s+/);
    const first = parts[0]!;
    const last = parts.length > 1 ? parts[parts.length - 1]! : "";
    return { name: last ? `${first} ${last[0]!.toUpperCase()}.` : first, firstName: first };
  }
  const local = identity.email?.split("@")[0]?.split("+")[0] ?? "";
  const first = capitalize(local.split(/[._-]/)[0] || "Neighbor");
  return { name: first, firstName: first };
}

/** Per-request memo for user lookups, so list queries don't re-read the same rows. */
export class UserCache {
  private cache = new Map<Id<"users">, Doc<"users"> | null>();
  constructor(private ctx: QueryCtx) {}

  async get(id: Id<"users">): Promise<Doc<"users"> | null> {
    if (!this.cache.has(id)) this.cache.set(id, await this.ctx.db.get("users", id));
    return this.cache.get(id) ?? null;
  }

  async person(id: Id<"users">): Promise<PersonDTO> {
    const user = await this.get(id);
    if (user) return toPerson(user);
    return { _id: id, name: "Former neighbor", initials: "FN", trusted: false };
  }

  async name(id: Id<"users"> | undefined): Promise<string | null> {
    if (!id) return null;
    return (await this.get(id))?.name ?? "Former neighbor";
  }
}
