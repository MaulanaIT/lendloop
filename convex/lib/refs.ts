import type { MutationCtx } from "../_generated/server";

const LOAN_COUNTER = "loanRef";
const FIRST_LOAN_NUMBER = 1001;

/** Allocates the next human loan reference ("L-1059") inside the calling transaction. */
export async function nextLoanRef(ctx: MutationCtx): Promise<string> {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", LOAN_COUNTER))
    .unique();
  const next = counter ? counter.value + 1 : FIRST_LOAN_NUMBER;
  if (counter) await ctx.db.patch("counters", counter._id, { value: next });
  else await ctx.db.insert("counters", { name: LOAN_COUNTER, value: next });
  return `L-${next}`;
}

/** Sets the counter so the next allocated reference is `L-${nextNumber}`. */
export async function setNextLoanNumber(ctx: MutationCtx, nextNumber: number): Promise<void> {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", LOAN_COUNTER))
    .unique();
  if (counter) await ctx.db.patch("counters", counter._id, { value: nextNumber - 1 });
  else await ctx.db.insert("counters", { name: LOAN_COUNTER, value: nextNumber - 1 });
}
