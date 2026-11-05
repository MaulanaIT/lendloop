import { describe, expect, test } from "vitest";
import { bookedRanges, computeAvailability, isAvailableNow } from "./availability";
import { notificationKey, parseIdempotencyKey, reminderKey } from "./automation";
import { addDays, fmtRangeShort, isISODate, rangeDays, todayISO, zonedTimeToMs } from "./dates";
import { signPayload, verifySignature } from "./signing";
import { contactUnlocked, daysOverdue, deriveLoanStatus, loanStatusLabel, validateRange } from "./status";

const TODAY = "2026-11-05";
const loan = (status: "pending" | "approved" | "returned", startDate: string, endDate: string) => ({ status, startDate, endDate });

describe("status derivation", () => {
  test("approved loans derive upcoming / on_loan / overdue from the dates", () => {
    expect(deriveLoanStatus(loan("approved", "2026-11-08", "2026-11-09"), TODAY)).toBe("upcoming");
    expect(deriveLoanStatus(loan("approved", "2026-11-04", "2026-11-06"), TODAY)).toBe("on_loan");
    expect(deriveLoanStatus(loan("approved", "2026-11-04", "2026-11-05"), TODAY)).toBe("on_loan"); // due today
    expect(deriveLoanStatus(loan("approved", "2026-10-31", "2026-11-03"), TODAY)).toBe("overdue");
    expect(deriveLoanStatus(loan("returned", "2026-10-31", "2026-11-03"), TODAY)).toBe("returned");
    expect(deriveLoanStatus(loan("pending", "2026-10-31", "2026-11-03"), TODAY)).toBe("pending");
  });

  test("labels and days overdue", () => {
    const l = loan("approved", "2026-10-31", "2026-11-03");
    expect(daysOverdue(l, TODAY)).toBe(2);
    expect(loanStatusLabel(l, TODAY)).toBe("Overdue · 2 days");
    expect(loanStatusLabel(loan("approved", "2026-11-04", "2026-11-05"), TODAY)).toBe("Due today");
    expect(loanStatusLabel(loan("approved", "2026-11-08", "2026-11-09"), TODAY)).toBe("Approved · starts Nov 8");
  });

  test("contact unlocks only while upcoming / on loan / overdue", () => {
    expect(["upcoming", "on_loan", "overdue"].every((s) => contactUnlocked(s as never))).toBe(true);
    expect(["pending", "returned", "declined", "cancelled"].some((s) => contactUnlocked(s as never))).toBe(false);
  });

  test("range validation", () => {
    expect(validateRange("2026-11-04", "2026-11-05", TODAY)).toBe("START_IN_PAST");
    expect(validateRange("2026-11-06", "2026-11-05", TODAY)).toBe("END_BEFORE_START");
    expect(validateRange("2026-11-05", "2026-11-19", TODAY)).toBe("TOO_LONG");
    expect(validateRange("2026-11-05", "2026-11-05", TODAY)).toBeNull();
    expect(rangeDays("2026-11-05", "2026-11-18")).toBe(14);
  });
});

describe("availability", () => {
  const loans = [loan("approved", "2026-10-31", "2026-11-03")];

  test("overdue shows as plain on loan to non-privileged viewers", () => {
    expect(computeAvailability(loans, TODAY, { removed: false, privileged: false })).toEqual({ kind: "on_loan", until: null });
    expect(computeAvailability(loans, TODAY, { removed: false, privileged: true })).toEqual({ kind: "overdue", days: 2 });
  });

  test("future bookings still count as available; pending requests never block", () => {
    const a = computeAvailability([loan("approved", "2026-11-08", "2026-11-09"), loan("pending", "2026-11-05", "2026-11-06")], TODAY, {
      removed: false,
      privileged: false,
    });
    expect(a).toEqual({ kind: "booked", from: "2026-11-08" });
    expect(isAvailableNow(a)).toBe(true);
    expect(isAvailableNow(computeAvailability([], TODAY, { removed: true, privileged: true }))).toBe(false);
  });

  test("booked ranges block an overdue loan through today and ignore pending", () => {
    expect(bookedRanges([...loans, loan("pending", "2026-11-10", "2026-11-11")], TODAY)).toEqual([{ start: "2026-10-31", end: TODAY }]);
  });
});

describe("dates", () => {
  test("today in the app timezone, ISO checks and formatting", () => {
    // 17:30 UTC on Nov 4 is already Nov 5 in Jakarta.
    expect(todayISO(Date.UTC(2026, 10, 4, 17, 30), "Asia/Jakarta")).toBe("2026-11-05");
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-11-05")).toBe(true);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(fmtRangeShort("2026-11-08", "2026-11-09")).toBe("Nov 8–9");
    expect(zonedTimeToMs("2026-11-05", "09:45", "Asia/Jakarta")).toBe(Date.UTC(2026, 10, 5, 2, 45));
  });
});

describe("idempotency keys", () => {
  test("round-trip and reject garbage", () => {
    expect(parseIdempotencyKey(notificationKey("L-1057", "requested"))).toEqual({ kind: "notification", loanRef: "L-1057", event: "requested" });
    expect(parseIdempotencyKey(reminderKey("L-1042", "2026-11-05"))).toEqual({ kind: "reminder", loanRef: "L-1042", runDate: "2026-11-05" });
    expect(parseIdempotencyKey("notify:L-1:overdue_reminder")).toBeNull();
    expect(parseIdempotencyKey("notify:L-1:nope")).toBeNull();
    expect(parseIdempotencyKey("reminder:L-1042")).toBeNull();
  });
});

describe("HMAC signing", () => {
  const body = JSON.stringify({ hello: "neighbor" });
  const now = 1_800_000_000;

  test("round-trips", async () => {
    const { timestamp, signature } = await signPayload("s3cret", body, now);
    expect(signature).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(await verifySignature("s3cret", body, timestamp, signature, now)).toEqual({ ok: true });
  });

  test("rejects a wrong secret, tampered body, stale timestamp and missing headers", async () => {
    const { timestamp, signature } = await signPayload("s3cret", body, now);
    expect(await verifySignature("other", body, timestamp, signature, now)).toEqual({ ok: false, reason: "mismatch" });
    expect(await verifySignature("s3cret", body + " ", timestamp, signature, now)).toEqual({ ok: false, reason: "mismatch" });
    expect(await verifySignature("s3cret", body, timestamp, signature, now + 301)).toEqual({ ok: false, reason: "stale" });
    expect(await verifySignature("s3cret", body, null, signature, now)).toEqual({ ok: false, reason: "missing_headers" });
    expect(await verifySignature("s3cret", body, timestamp, "v1=zz", now)).toEqual({ ok: false, reason: "malformed" });
  });
});
