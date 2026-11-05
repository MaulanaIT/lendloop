"use client";

import { PackageCheck, TriangleExclamationPoint, Undo2, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AutomationLine } from "@/components/lendloop/automation-line";
import { CategoryIcon } from "@/components/lendloop/category-icon";
import { ApproveOverlapDialog, DeclineDialog, MarkReturnedDialog } from "@/components/lendloop/dialogs";
import { PersonAvatar } from "@/components/lendloop/person";
import { RelativeTime } from "@/components/lendloop/relative-time";
import { ReturnReportedChip, StatusBadge } from "@/components/lendloop/status-badge";
import { useNow } from "@/components/lendloop/use-now";
import { Button } from "@/components/ui/button";
import { OFFLINE_ACTION_REASON, firstName, fmtWhen, loanBadgeLabel } from "@/lib/copy";
import { fmtDayCount, fmtDayWithWeekday, fmtRangeShort, type ISODate } from "@/lib/domain/dates";
import type { LoanRowDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";
import { ContactLine, StaleNote } from "./loan-parts";
import type { LoanActions } from "./use-loan-actions";

export type IncomingRowProps = {
  loan: LoanRowDTO;
  today: ISODate;
  actions: LoanActions;
  offline: boolean;
  stale: boolean;
  /** 2s teal highlight: a request that just arrived live, or a row the owner just approved. */
  flash: boolean;
  /** Called after a successful approve so the page can follow the row to "Active & upcoming". */
  onApproved?: (loan: LoanRowDTO) => void;
};

const refNumber = (ref: string) => Number.parseInt(ref.replace(/\D/g, ""), 10) || 0;

/** "Sat Nov 7": incoming rows spell out the weekday (brief B8). */
const weekdayDay = (d: ISODate) => fmtDayWithWeekday(d).replace(",", "");

/**
 * "Overlaps with Sam R.'s request on Nov 8": shown on the later of two
 * overlapping pending requests, naming the earlier one and the shared days.
 */
function overlapNote(loan: LoanRowDTO): string | null {
  const earlier = loan.overlaps.find((o) => refNumber(o.ref) < refNumber(loan.ref));
  if (!earlier) return null;
  const start = loan.startDate > earlier.startDate ? loan.startDate : earlier.startDate;
  const end = loan.endDate < earlier.endDate ? loan.endDate : earlier.endDate;
  return `Overlaps with ${earlier.borrowerName}'s request on ${fmtRangeShort(start, end)}`;
}

/** One request or loan on the owner's Incoming page (brief B8). */
export function IncomingRow({ loan, today, actions, offline, stale, flash, onApproved }: IncomingRowProps) {
  const [dialog, setDialog] = useState<"approve" | "decline" | "returned" | null>(null);
  const now = useNow();
  const { status } = loan;
  const headingId = `in-${loan.ref}`;
  const pending = status === "pending";
  const out = status === "on_loan" || status === "overdue";
  const reported = out && loan.returnReportedAt !== null;
  const overlap = pending ? overlapNote(loan) : null;
  const blocked = offline ? OFFLINE_ACTION_REASON : stale ? "Refreshing…" : null;
  const showAutomation =
    loan.lastAutomation !== null &&
    (pending ||
      ((status === "upcoming" || status === "on_loan") && !reported && loan.lastAutomation.event === "approved"));

  const approve = async () => {
    if (await actions.approve(loan)) onApproved?.(loan);
  };

  return (
    <li
      className={cn(
        "min-w-0 rounded-lg border shadow-ll-card transition-colors duration-700 ease-out",
        flash
          ? "animate-ll-in border-primary bg-card"
          : reported
            ? "border-warning-border bg-warning-bg"
            : status === "overdue"
              ? "border-danger-border bg-card"
              : "border-border bg-card",
      )}
    >
      <article
        aria-labelledby={headingId}
        className={cn(
          "flex flex-wrap items-start gap-x-5 gap-y-4 rounded-[inherit] p-4 sm:p-5",
          flash && "animate-ll-flash",
        )}
      >
        <PersonAvatar initials={loan.borrower.initials} size="lg" bordered className="size-11" />
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 id={headingId} className="m-0 text-base leading-[1.3] font-semibold">
                {loan.borrower.name}
              </h2>
              <Link
                href={`/loans/${loan.ref}`}
                aria-label={`Loan ${loan.ref}`}
                className="font-mono text-xs text-muted-foreground hover:text-primary"
              >
                {loan.ref}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
              <CategoryIcon category={loan.tool.category} className="size-4" />
              {loan.tool.removed ? (
                <span className="font-medium text-foreground">{loan.tool.name}</span>
              ) : (
                <Link
                  href={`/tools/${loan.tool._id}`}
                  className="font-medium text-foreground no-underline hover:text-primary"
                >
                  {loan.tool.name}
                </Link>
              )}
              <span aria-hidden>·</span>
              <span className="text-foreground tabular">
                <time dateTime={loan.startDate}>{weekdayDay(loan.startDate)}</time> →{" "}
                <time dateTime={loan.endDate}>{weekdayDay(loan.endDate)}</time>
              </span>
              <span aria-hidden>·</span>
              <span className="tabular">{fmtDayCount(loan.startDate, loan.endDate)}</span>
            </div>
            {pending ? (
              <p className="m-0 text-[13px] text-muted-foreground">
                Requested <RelativeTime ms={loan.createdAt} nowMs={now} withTooltip={false} />
              </p>
            ) : null}
          </div>

          {!pending ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={status} label={loanBadgeLabel(loan, today)} />
              {reported ? <ReturnReportedChip /> : null}
            </div>
          ) : null}
          {reported && loan.returnReportedAt !== null ? (
            <p className="m-0 flex items-start gap-1.5 font-medium text-pretty text-warning">
              <Undo2 aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {firstName(loan.borrower.name)} says it&apos;s returned · {fmtWhen(loan.returnReportedAt, now)}
              </span>
            </p>
          ) : null}
          {status === "overdue" ? (
            <p className="m-0 flex items-center gap-1.5 text-[13px] text-muted-foreground tabular">
              <Zap aria-hidden className="size-3.5 shrink-0" />
              Reminders sent: {loan.remindersSent}
            </p>
          ) : null}
          {showAutomation ? <AutomationLine automation={loan.lastAutomation} nowMs={now} withTime={pending} /> : null}
          {overlap ? (
            <p
              role="note"
              className="m-0 flex items-start gap-2 self-start rounded-md border border-warning-border bg-warning-bg px-2.5 py-2 text-sm font-medium text-pretty text-warning"
            >
              <TriangleExclamationPoint aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{overlap}</span>
            </p>
          ) : null}
          {loan.contactEmail ? <ContactLine email={loan.contactEmail} /> : null}
          {stale ? <StaleNote pending={pending} /> : null}
        </div>

        {/* Owner-only actions; Convex re-checks ownership and status in approve/decline/markReturned. */}
        {pending || out ? (
          <div className="flex w-full gap-2 sm:w-auto sm:flex-none">
            {pending ? (
              <>
                <Button
                  className="flex-1 px-4 sm:flex-none"
                  disabledReason={blocked}
                  onClick={() => (loan.overlaps.length ? setDialog("approve") : approve().catch(() => {}))}
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 px-4 sm:flex-none"
                  disabledReason={blocked}
                  onClick={() => setDialog("decline")}
                >
                  Decline
                </Button>
              </>
            ) : (
              <Button
                className="flex-1 pr-4 pl-3.5 sm:flex-none"
                disabledReason={blocked}
                onClick={() => setDialog("returned")}
              >
                <PackageCheck aria-hidden />
                Mark returned
              </Button>
            )}
          </div>
        ) : null}
      </article>

      {/* Dialogs stay mounted while an optimistic update hides their button, so a failed confirm stays open. */}
      <>
        <ApproveOverlapDialog
          open={dialog === "approve"}
          onOpenChange={(o) => setDialog(o ? "approve" : null)}
          borrowerName={loan.borrower.name}
          overlaps={loan.overlaps}
          onConfirm={approve}
        />
        <DeclineDialog
          open={dialog === "decline"}
          onOpenChange={(o) => setDialog(o ? "decline" : null)}
          borrowerName={loan.borrower.name}
          onConfirm={(reason) => actions.decline(loan, reason)}
        />
      </>
      <MarkReturnedDialog
        open={dialog === "returned"}
        onOpenChange={(o) => setDialog(o ? "returned" : null)}
        toolName={loan.tool.name}
        onConfirm={() => actions.markReturned(loan)}
      />
    </li>
  );
}
