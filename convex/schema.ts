import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  vCategory,
  vCondition,
  vDeliveryStatus,
  vErrorCategory,
  vNotificationEvent,
  vRecipientRole,
  vRemoveReason,
  vRole,
  vStoredLoanStatus,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    // Clerk identity (`identity.tokenIdentifier`). Unset for seeded demo users
    // until they first sign in with the matching verified email.
    tokenIdentifier: v.optional(v.string()),
    name: v.string(), // display name, "Maya L."
    firstName: v.string(),
    email: v.string(), // lowercase; never sent to clients except as unlocked contact
    // Never written from client input: new users are always "user";
    // admins are seeded or promoted with the internal `users:setRole`.
    role: vRole,
    trusted: v.boolean(),
    trustedGrantedBy: v.optional(v.id("users")),
    trustedGrantedAt: v.optional(v.number()),
    joinedAt: v.number(),
    // Loans completed as lender before this board tracked them (demo seed
    // history). Added to the live count of returned loans.
    loansCompletedBaseline: v.optional(v.number()),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: vCategory,
    condition: vCondition,
    description: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Admin soft-remove: hidden from everyone but the owner and admins.
    removed: v.optional(
      v.object({
        by: v.id("users"),
        at: v.number(),
        reason: vRemoveReason,
        detail: v.optional(v.string()),
      }),
    ),
    // Owner delete is also soft so loan history keeps its tool name.
    deletedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    ref: v.string(), // "L-1042", shown in the UI and used in URLs and idempotency keys
    toolId: v.id("tools"),
    ownerId: v.id("users"), // denormalized from the tool for indexed "incoming" queries
    borrowerId: v.id("users"),
    startDate: v.string(), // "YYYY-MM-DD"
    endDate: v.string(),
    // overdue / upcoming / on_loan are derived from dates (lib/domain/status.ts), never stored.
    status: vStoredLoanStatus,
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
    declineReason: v.optional(v.string()),
    declineKind: v.optional(v.union(v.literal("owner"), v.literal("system"))),
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(
      v.union(v.literal("borrower"), v.literal("listing_removed"), v.literal("listing_deleted")),
    ),
    returnedAt: v.optional(v.number()),
    returnedOn: v.optional(v.string()), // calendar day the owner marked it returned
    returnReportedAt: v.optional(v.number()),
  })
    .index("by_ref", ["ref"])
    .index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_owner", ["ownerId"])
    .index("by_status_end", ["status", "endDate"]),

  // Human events on a loan. Automation events live in `deliveries`.
  loanEvents: defineTable({
    loanId: v.id("loans"),
    type: v.union(
      v.literal("requested"),
      v.literal("approved"),
      v.literal("declined"),
      v.literal("cancelled"),
      v.literal("return_reported"),
      v.literal("returned"),
    ),
    actorId: v.optional(v.id("users")), // absent for system actions ("Dates taken", listing removed)
    at: v.number(),
    detail: v.optional(v.string()),
  }).index("by_loan", ["loanId", "at"]),

  // One row per notification / reminder (unique idempotency key).
  deliveries: defineTable({
    idempotencyKey: v.string(),
    kind: v.union(v.literal("notification"), v.literal("reminder")),
    event: vNotificationEvent,
    loanId: v.id("loans"),
    recipientRole: vRecipientRole,
    status: vDeliveryStatus,
    attempts: v.number(),
    maxAttempts: v.number(),
    nextRetryAt: v.optional(v.number()),
    lastErrorCategory: v.optional(vErrorCategory),
    executionId: v.optional(v.string()),
    channel: v.optional(v.string()), // "email" | "mock_log"
    fieldsSent: v.array(v.string()), // field NAMES only, never values
    signed: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_execution", ["executionId"])
    .index("by_loan", ["loanId"])
    .index("by_created", ["createdAt"])
    .index("by_status", ["status", "updatedAt"]),

  // Every attempt, including write-backs ignored as duplicates (admin only).
  deliveryAttempts: defineTable({
    deliveryId: v.id("deliveries"),
    idempotencyKey: v.string(),
    attempt: v.number(),
    outcome: v.union(
      v.literal("accepted"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("duplicate_ignored"),
    ),
    errorCategory: v.optional(vErrorCategory),
    executionId: v.optional(v.string()),
    source: v.union(v.literal("convex"), v.literal("n8n")),
    // Failed attempt after which nothing retried automatically. Unset on older rows.
    final: v.optional(v.boolean()),
    at: v.number(),
  })
    .index("by_delivery", ["deliveryId", "at"])
    .index("by_at", ["at"]),

  reminderRuns: defineTable({
    executionId: v.string(), // n8n execution id, idempotency key for the run summary
    runDate: v.string(),
    status: v.union(v.literal("completed"), v.literal("completed_with_failures"), v.literal("failed")),
    found: v.number(),
    sent: v.number(),
    skipped: v.number(),
    duplicates: v.number(),
    failed: v.number(),
    durationMs: v.number(),
    finishedAt: v.number(),
  })
    .index("by_execution", ["executionId"])
    .index("by_finished", ["finishedAt"]),

  // Reports from the n8n error workflow (crashed executions).
  workflowErrors: defineTable({
    executionId: v.string(),
    workflow: v.string(),
    node: v.optional(v.string()),
    errorCategory: vErrorCategory,
    idempotencyKey: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_execution", ["executionId"])
    .index("by_at", ["at"]),

  // Singleton bumped hourly by convex/clock.ts; queries read it so the day
  // change re-runs them (see queryNow in lib/today.ts).
  clock: defineTable({
    hourMs: v.number(),
  }),

  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),
});
