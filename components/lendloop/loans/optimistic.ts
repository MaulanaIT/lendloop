import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { clientToday } from "@/lib/config";
import { SYSTEM_DECLINE_REASON } from "@/lib/domain/categories";
import type { LoanDetailDTO, LoanRowDTO } from "@/lib/domain/dto";
import { deriveLoanStatus } from "@/lib/domain/status";

// Optimistic patches for loan actions (brief A4: badges change in place).
// They only touch the client's cached query results; the server result
// replaces them as soon as the mutation commits, or rolls them back if it fails.

type RowPatch = (row: LoanRowDTO) => Partial<LoanRowDTO> | null;

/** No action is possible while a mutation is in flight for the row. */
const NO_ACTIONS: LoanDetailDTO["actions"] = {
  canApprove: false,
  canDecline: false,
  canCancel: false,
  canReportReturned: false,
  canMarkReturned: false,
};

function patchList(rows: LoanRowDTO[], patch: RowPatch): LoanRowDTO[] {
  let changed = false;
  const next = rows.map((row) => {
    const p = patch(row);
    if (!p) return row;
    changed = true;
    return { ...row, ...p };
  });
  return changed ? next : rows;
}

/** Applies `patch` to every cached copy of a loan: My requests, Incoming and loan detail pages. */
export function patchLoans(store: OptimisticLocalStore, patch: RowPatch) {
  for (const query of [api.loans.myRequests, api.loans.incoming] as const) {
    const rows = store.getQuery(query, {});
    if (rows) store.setQuery(query, {}, patchList(rows, patch));
  }
  for (const { args, value } of store.getAllQueries(api.loans.get)) {
    if (!value) continue;
    const p = patch(value);
    if (p) store.setQuery(api.loans.get, args, { ...value, ...p, actions: NO_ACTIONS });
  }
}

export function approvePatch(loanId: Id<"loans">, overlapIds: Set<string>): RowPatch {
  const today = clientToday();
  return (row) => {
    if (row._id === loanId) {
      const status = deriveLoanStatus({ status: "approved", startDate: row.startDate, endDate: row.endDate }, today);
      return { storedStatus: "approved", status, overlaps: [], decidedAt: Date.now() };
    }
    // Overlapping pending requests are auto-declined with "Dates taken" by the server.
    if (overlapIds.has(row._id) && row.status === "pending") {
      return {
        storedStatus: "declined",
        status: "declined",
        declineKind: "system",
        declineReason: SYSTEM_DECLINE_REASON,
        overlaps: [],
      };
    }
    if (row.overlaps.some((o) => o.loanId === loanId)) {
      return { overlaps: row.overlaps.filter((o) => o.loanId !== loanId) };
    }
    return null;
  };
}

export function declinePatch(loanId: Id<"loans">, reason: string | null): RowPatch {
  return (row) => {
    if (row._id === loanId) {
      return {
        storedStatus: "declined",
        status: "declined",
        declineKind: "owner",
        declineReason: reason,
        overlaps: [],
        decidedAt: Date.now(),
      };
    }
    if (row.overlaps.some((o) => o.loanId === loanId)) {
      return { overlaps: row.overlaps.filter((o) => o.loanId !== loanId) };
    }
    return null;
  };
}

export function markReturnedPatch(loanId: Id<"loans">): RowPatch {
  const today = clientToday();
  return (row) =>
    row._id === loanId
      ? { storedStatus: "returned", status: "returned", returnedOn: today, daysOverdue: 0, contactEmail: null }
      : null;
}

export function cancelPatch(loanId: Id<"loans">): RowPatch {
  return (row) =>
    row._id === loanId
      ? { storedStatus: "cancelled", status: "cancelled", cancelledBy: "borrower", contactEmail: null }
      : null;
}

export function reportReturnedPatch(loanId: Id<"loans">): RowPatch {
  return (row) => (row._id === loanId && row.returnReportedAt === null ? { returnReportedAt: Date.now() } : null);
}
