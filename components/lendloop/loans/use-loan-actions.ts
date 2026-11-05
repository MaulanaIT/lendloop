"use client";

import { useMutation } from "convex/react";
import { Ban, CircleX, PackageCheck, Undo2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TOAST_COPY } from "@/lib/copy";
import type { LoanRowDTO } from "@/lib/domain/dto";
import { parseAppError } from "@/lib/domain/errors";
import { toast, toastAppError } from "@/lib/toast";
import {
  approvePatch,
  cancelPatch,
  declinePatch,
  markReturnedPatch,
  patchLoans,
  reportReturnedPatch,
} from "./optimistic";

export type LoanActionOptions = {
  /**
   * Called instead of an error toast when the server says the loan was
   * already handled (someone else acted first). The row shows "This request
   * was already handled. Refreshing…" while realtime catches up.
   */
  onStale?: (loanId: Id<"loans">) => void;
};

/**
 * Loan mutations with optimistic updates and the A9 toasts. Every function
 * resolves on success and rejects on failure (after showing the error), so
 * confirm dialogs close on success and stay open on failure. A stale action
 * resolves too (there is nothing left to retry); `approve` resolves to
 * whether it actually went through.
 *
 * The UI only offers actions the viewer's role allows, but Convex re-checks
 * party, role and status in every mutation.
 */
export function useLoanActions({ onStale }: LoanActionOptions = {}) {
  const approveM = useMutation(api.loans.approve).withOptimisticUpdate((store, { loanId }) => {
    const row =
      store.getQuery(api.loans.incoming, {})?.find((r) => r._id === loanId) ??
      store.getAllQueries(api.loans.get).find((q) => q.value?._id === loanId)?.value;
    patchLoans(store, approvePatch(loanId, new Set(row?.overlaps.map((o) => o.loanId) ?? [])));
  });
  const declineM = useMutation(api.loans.decline).withOptimisticUpdate((store, { loanId, reason }) =>
    patchLoans(store, declinePatch(loanId, reason ?? null)),
  );
  const markReturnedM = useMutation(api.loans.markReturned).withOptimisticUpdate((store, { loanId }) =>
    patchLoans(store, markReturnedPatch(loanId)),
  );
  const cancelM = useMutation(api.loans.cancel).withOptimisticUpdate((store, { loanId }) =>
    patchLoans(store, cancelPatch(loanId)),
  );
  const reportReturnedM = useMutation(api.loans.reportReturned).withOptimisticUpdate((store, { loanId }) =>
    patchLoans(store, reportReturnedPatch(loanId)),
  );

  const guarded = useCallback(
    async (loanId: Id<"loans">, run: () => Promise<unknown>, onSuccess: () => void): Promise<boolean> => {
      try {
        await run();
      } catch (err) {
        if (parseAppError(err).code === "ALREADY_HANDLED" && onStale) {
          onStale(loanId);
          return false;
        }
        toastAppError(err);
        throw err;
      }
      onSuccess();
      return true;
    },
    [onStale],
  );

  return useMemo(
    () => ({
      approve: (loan: Pick<LoanRowDTO, "_id" | "borrower">) =>
        guarded(
          loan._id,
          () => approveM({ loanId: loan._id }),
          () => toast.success(TOAST_COPY.approved(loan.borrower.name)),
        ),
      decline: async (loan: Pick<LoanRowDTO, "_id">, reason: string | null): Promise<void> => {
        await guarded(
          loan._id,
          () => declineM({ loanId: loan._id, ...(reason ? { reason } : {}) }),
          () => toast.message(TOAST_COPY.declined, { icon: CircleX }),
        );
      },
      markReturned: async (loan: Pick<LoanRowDTO, "_id">): Promise<void> => {
        await guarded(
          loan._id,
          () => markReturnedM({ loanId: loan._id }),
          () => toast.success(TOAST_COPY.markedReturned, { icon: PackageCheck }),
        );
      },
      cancel: async (loan: Pick<LoanRowDTO, "_id">): Promise<void> => {
        await guarded(
          loan._id,
          () => cancelM({ loanId: loan._id }),
          () => toast.message("Request cancelled.", { icon: Ban }),
        );
      },
      reportReturned: async (loan: Pick<LoanRowDTO, "_id" | "owner">): Promise<void> => {
        await guarded(
          loan._id,
          () => reportReturnedM({ loanId: loan._id }),
          () => toast.success(TOAST_COPY.reportedReturned(loan.owner.name), { icon: Undo2 }),
        );
      },
    }),
    [guarded, approveM, declineM, markReturnedM, cancelM, reportReturnedM],
  );
}

export type LoanActions = ReturnType<typeof useLoanActions>;
