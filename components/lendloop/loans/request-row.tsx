"use client";

import Link from "next/link";
import { useState } from "react";
import { AutomationLine } from "@/components/lendloop/automation-line";
import { CategoryTile } from "@/components/lendloop/category-icon";
import { CancelRequestDialog, ReportReturnedDialog } from "@/components/lendloop/dialogs";
import { DateRange } from "@/components/lendloop/relative-time";
import { ReturnReportedChip, StatusBadge, datesClassName } from "@/components/lendloop/status-badge";
import { TrustedLenderBadge } from "@/components/lendloop/trusted-badge";
import { Button } from "@/components/ui/button";
import { OFFLINE_ACTION_REASON, firstName, loanBadgeLabel } from "@/lib/copy";
import type { ISODate } from "@/lib/domain/dates";
import type { AutomationLineDTO, LoanRowDTO } from "@/lib/domain/dto";
import { isActive } from "@/lib/domain/status";
import { cn } from "@/lib/utils";
import { ActivityToggle, ContactLine, StaleNote } from "./loan-parts";
import type { LoanActions } from "./use-loan-actions";

export type RequestRowProps = {
  loan: LoanRowDTO;
  today: ISODate;
  actions: LoanActions;
  offline: boolean;
  stale: boolean;
};

/**
 * Which automation line a borrower sees: the request notification while
 * pending, the latest reminder while overdue (even after a later "return
 * reported" notification), and any notification that is still in flight or
 * failed on an active loan. Settled history stays quiet.
 */
function automationLine(loan: LoanRowDTO): AutomationLineDTO | null {
  const a = loan.lastAutomation;
  if (loan.status === "overdue" && loan.lastReminder) return loan.lastReminder;
  if (!a) return null;
  if (loan.status === "pending") return a;
  if (!isActive(loan.status)) return null;
  return a.status !== "sent" ? a : null;
}

/** One outgoing request / borrowing on "My requests" (brief B7). */
export function RequestRow({ loan, today, actions, offline, stale }: RequestRowProps) {
  const [dialog, setDialog] = useState<"cancel" | "returned" | null>(null);
  const { status } = loan;
  const headingId = `rq-${loan.ref}`;
  const reported = loan.returnReportedAt !== null && (status === "on_loan" || status === "overdue");
  const ownerReason = status === "declined" && loan.declineKind === "owner" ? loan.declineReason : null;
  const blocked = offline ? OFFLINE_ACTION_REASON : stale ? "Refreshing…" : null;
  const automation = automationLine(loan);

  // Borrower-only actions; Convex re-checks party and status in loans.cancel / loans.reportReturned.
  const canReport = (status === "on_loan" || status === "overdue") && !reported;
  const canCancel = status === "pending" || status === "upcoming";

  return (
    <li
      className={cn(
        "min-w-0 rounded-lg border bg-card shadow-ll-card",
        status === "overdue" ? "border-danger-border" : "border-border",
      )}
    >
      <article aria-labelledby={headingId} className="flex flex-wrap items-start gap-x-5 gap-y-4 p-4 sm:p-5">
        <CategoryTile category={loan.tool.category} size={48} />
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 id={headingId} className="m-0 text-base leading-[1.3] font-semibold">
                <Link href={`/loans/${loan.ref}`} className="text-foreground no-underline hover:text-primary">
                  {loan.tool.name}
                </Link>
              </h2>
              <span className="font-mono text-xs text-muted-foreground">{loan.ref}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
              <span>from {loan.owner.name}</span>
              {loan.owner.trusted ? <TrustedLenderBadge size="sm" /> : null}
              <span aria-hidden>·</span>
              <DateRange
                start={loan.startDate}
                end={loan.endDate}
                className={cn("text-foreground", datesClassName(status))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} label={loanBadgeLabel(loan, today, { withReason: false })} />
            {reported ? <ReturnReportedChip /> : null}
            {ownerReason ? (
              <span className="inline-flex min-h-[26px] items-center rounded-full border border-[var(--st-declined-border)] bg-[var(--st-declined-bg)] px-2.5 py-0.5 text-[13px] text-[var(--st-declined-text)]">
                “{ownerReason}”
              </span>
            ) : null}
            {status === "returned" ? (
              <span className="text-[13px] text-muted-foreground">· marked returned by {loan.owner.name}</span>
            ) : null}
          </div>

          {automation ? <AutomationLine automation={automation} /> : null}
          {reported ? (
            <p className="m-0 text-sm text-foreground">{firstName(loan.owner.name)} still needs to mark it returned.</p>
          ) : null}
          {loan.contactEmail ? <ContactLine email={loan.contactEmail} /> : null}
          {stale ? <StaleNote pending={status === "pending"} /> : null}
        </div>

        {canReport || canCancel ? (
          <div className="flex w-full gap-2 sm:w-auto sm:flex-none">
            {canReport ? (
              <Button
                variant="secondary"
                className="flex-1 sm:flex-none"
                disabledReason={blocked}
                onClick={() => setDialog("returned")}
              >
                I&apos;ve returned it
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant={status === "upcoming" ? "secondary" : "outline"}
                className="flex-1 sm:flex-none"
                disabledReason={blocked}
                onClick={() => setDialog("cancel")}
              >
                {status === "upcoming" ? "Cancel" : "Cancel request"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </article>

      <ActivityToggle loan={loan} />

      {/* Dialogs stay mounted while an optimistic update hides their button, so a failed confirm stays open. */}
      <CancelRequestDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => setDialog(o ? "cancel" : null)}
        toolName={loan.tool.name}
        ownerName={loan.owner.name}
        startDate={loan.startDate}
        endDate={loan.endDate}
        kind={status === "upcoming" ? "booking" : "request"}
        onConfirm={() => actions.cancel(loan)}
      />
      <ReportReturnedDialog
        open={dialog === "returned"}
        onOpenChange={(o) => setDialog(o ? "returned" : null)}
        toolName={loan.tool.name}
        ownerName={loan.owner.name}
        onConfirm={() => actions.reportReturned(loan)}
      />
    </li>
  );
}
