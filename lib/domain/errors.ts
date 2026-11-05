// Error codes thrown by Convex functions as ConvexError({ code, message?, field? })
// and the UI copy each one maps to.

export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION",
  // Specific conflicts the request panel renders inline.
  "DATES_TAKEN",
  "DUPLICATE_REQUEST",
  "OWN_TOOL",
  "ALREADY_HANDLED",
  "HAS_ACTIVE_LOAN",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type AppErrorData = {
  code: ErrorCode;
  message?: string;
  /** For VALIDATION: the offending field, so the form can focus it. */
  field?: string;
};

export const ERROR_COPY: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Your session expired. Sign in again to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find that.",
  CONFLICT: "This request was already handled. Refreshing…",
  VALIDATION: "Please check the highlighted fields.",
  DATES_TAKEN: "Those dates were just booked. Pick new dates.",
  DUPLICATE_REQUEST: "You already have a pending request for this tool.",
  OWN_TOOL: "You can't borrow your own tool.",
  ALREADY_HANDLED: "This request was already handled. Refreshing…",
  HAS_ACTIVE_LOAN: "Can't delete while lent out. Mark it returned first.",
};

export const NETWORK_ERROR_COPY = "Couldn't reach LendLoop. Check your connection and try again.";

function isErrorCode(v: unknown): v is ErrorCode {
  return typeof v === "string" && (ERROR_CODES as readonly string[]).includes(v);
}

/** Extract { code, message, field } from anything thrown by a Convex call. */
export function parseAppError(
  err: unknown,
): { code: ErrorCode | "UNKNOWN"; message?: string; field?: string; copy: string } {
  const data = (err as { data?: unknown } | null)?.data;
  if (data && typeof data === "object" && isErrorCode((data as AppErrorData).code)) {
    const d = data as AppErrorData;
    return { ...d, copy: d.message ?? ERROR_COPY[d.code] };
  }
  return { code: "UNKNOWN", copy: NETWORK_ERROR_COPY };
}
