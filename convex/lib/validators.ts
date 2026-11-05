import { v } from "convex/values";

// Convex validators mirroring the enums in lib/domain. Keep in sync.

export const vRole = v.union(v.literal("user"), v.literal("admin"));

export const vCategory = v.union(
  v.literal("power"),
  v.literal("hand"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("ladders"),
  v.literal("other"),
);

export const vCondition = v.union(
  v.literal("likenew"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);

export const vStoredLoanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("returned"),
  v.literal("declined"),
  v.literal("cancelled"),
);

export const vRemoveReason = v.union(
  v.literal("Prohibited item"),
  v.literal("Unsafe"),
  v.literal("Spam"),
  v.literal("Duplicate"),
  v.literal("Other"),
);

export const vNotificationEvent = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("return_reported"),
  v.literal("returned"),
  v.literal("overdue_reminder"),
);

export const vRecipientRole = v.union(v.literal("owner"), v.literal("borrower"));

export const vDeliveryStatus = v.union(
  v.literal("queued"),
  v.literal("accepted"),
  v.literal("sent"),
  v.literal("retrying"),
  v.literal("failed"),
);

export const vErrorCategory = v.union(
  v.literal("timeout"),
  v.literal("upstream_5xx"),
  v.literal("upstream_4xx"),
  v.literal("network"),
  v.literal("signature_rejected"),
  v.literal("not_configured"),
  v.literal("delivery_failed"),
  v.literal("superseded"),
);
