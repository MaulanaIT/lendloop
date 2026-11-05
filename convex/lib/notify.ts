import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  FIELDS_SENT,
  MAX_ATTEMPTS,
  notificationKey,
  type NotificationEvent,
  type RecipientRole,
} from "../../lib/domain/automation";

/**
 * Records a notification for `loan` and schedules the signed webhook call.
 * Runs inside the business mutation, so the delivery row commits atomically
 * with the status change. Idempotent: one delivery per (loan, event) key, so a
 * retried mutation never notifies twice.
 */
export async function enqueueNotification(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  event: Exclude<NotificationEvent, "overdue_reminder">,
  recipientRole: RecipientRole,
): Promise<Id<"deliveries">> {
  const idempotencyKey = notificationKey(loan.ref, event);
  const existing = await ctx.db
    .query("deliveries")
    .withIndex("by_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .first();
  if (existing) return existing._id;

  const now = Date.now();
  const deliveryId = await ctx.db.insert("deliveries", {
    idempotencyKey,
    kind: "notification",
    event,
    loanId: loan._id,
    recipientRole,
    status: "queued",
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    fieldsSent: [...FIELDS_SENT],
    signed: true,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.notifications.send, { deliveryId });
  return deliveryId;
}
