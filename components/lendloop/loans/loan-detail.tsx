"use client";

import { ArrowLeft, Lock, LockOpen, PackageCheck, Shield, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActivityTimeline, ActivityTimelineSkeleton } from "@/components/lendloop/activity-timeline";
import { useOffline } from "@/components/lendloop/banners";
import { CategoryTile } from "@/components/lendloop/category-icon";
import {
  ApproveOverlapDialog,
  CancelRequestDialog,
  DeclineDialog,
  MarkReturnedDialog,
  ReportReturnedDialog,
} from "@/components/lendloop/dialogs";
import { ErrorState } from "@/components/lendloop/error-state";
import { PersonAvatar } from "@/components/lendloop/person";
import { DateRange } from "@/components/lendloop/relative-time";
import { ReturnReportedChip, StatusBadge, datesClassName } from "@/components/lendloop/status-badge";
import { TrustedLenderBadge } from "@/components/lendloop/trusted-badge";
import { useNow } from "@/components/lendloop/use-now";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import { CONTACT_LOCKED_NOTE, OFFLINE_ACTION_REASON, firstName, fmtWhen, loanBadgeLabel } from "@/lib/copy";
import { diffDays, fmtDay, fmtDayCount, type ISODate } from "@/lib/domain/dates";
import type { LoanDetailDTO, PersonDTO } from "@/lib/domain/dto";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { cn } from "@/lib/utils";
import { StaleNote, useStaleRows } from "./loan-parts";
import { useLoanActions } from "./use-loan-actions";

// ─── Header helpers ───────────────────────────────────────────────────────

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const longDay = (d: ISODate) => `${fmtDay(d)}, ${d.slice(0, 4)}`;

/** "Due 2 days ago" / "Due today" / "Starts in 3 days", with the absolute day for the tooltip. */
function dueLabel(
  loan: LoanDetailDTO,
  today: ISODate,
): { label: string; date: ISODate; abs: string; danger: boolean } | null {
  if (loan.status === "on_loan" || loan.status === "overdue") {
    const od = diffDays(today, loan.endDate);
    const label =
      od > 0
        ? `Due ${plural(od, "day")} ago`
        : od === 0
          ? "Due today"
          : od === -1
            ? "Due tomorrow"
            : `Due in ${plural(-od, "day")}`;
    return { label, date: loan.endDate, abs: `Due ${longDay(loan.endDate)}`, danger: od > 0 };
  }
  if (loan.status === "upcoming") {
    const d = diffDays(loan.startDate, today);
    const label = d <= 0 ? "Starts today" : d === 1 ? "Starts tomorrow" : `Starts in ${plural(d, "day")}`;
    return { label, date: loan.startDate, abs: `Starts ${longDay(loan.startDate)}`, danger: false };
  }
  return null;
}

/** Back to the list, on the tab that holds this loan (the tab keys of each page's ?tab=). */
function backLink(loan: LoanDetailDTO): { label: string; href: string } {
  if (loan.adminView) return { label: "Admin · Loans", href: "/admin/loans" };
  const settled = loan.status === "returned" || loan.status === "declined" || loan.status === "cancelled";
  if (loan.viewerRole === "owner") {
    const tab = settled ? "history" : loan.status === "overdue" ? "overdue" : loan.status === "pending" ? null : "active";
    return { label: "Incoming", href: tab ? `/me/incoming?tab=${tab}` : "/me/incoming" };
  }
  return { label: "My requests", href: settled ? "/me/requests?tab=history" : "/me/requests" };
}

// ─── Page body ────────────────────────────────────────────────────────────

export type LoanDetailProps = {
  loan: LoanDetailDTO;
  today: ISODate;
  /** The viewer is an admin: the timeline includes attempts and execution details (server-filtered). */
  viewerIsAdmin: boolean;
};

/** "/loans/[ref]" (brief B9): header with role-based actions, People card, activity timeline. */
export function LoanDetail({ loan, today, viewerIsAdmin }: LoanDetailProps) {
  const back = backLink(loan);
  return (
    <>
      {loan.adminView ? (
        <div role="note" className="bg-admin-bg text-admin">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-[13px] font-semibold sm:px-6 lg:px-8">
            <Shield aria-hidden className="size-4" />
            Admin view · read-only
          </div>
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 sm:px-6 lg:px-8">
        <Link
          href={back.href}
          className="inline-flex min-h-11 items-center gap-1.5 font-medium text-muted-foreground no-underline hover:text-foreground md:min-h-10"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {back.label}
        </Link>
        <LoanHeader loan={loan} today={today} />
        <div className="mt-7 grid items-start gap-6 min-[960px]:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
          <ActivityCard loan={loan} admin={viewerIsAdmin} />
          <PeopleCard loan={loan} />
        </div>
      </div>
    </>
  );
}

function LoanHeader({ loan, today }: { loan: LoanDetailDTO; today: ISODate }) {
  const now = useNow();
  const due = dueLabel(loan, today);
  const out = loan.status === "on_loan" || loan.status === "overdue";
  const reported = out && loan.returnReportedAt !== null;

  let reportedText: string | null = null;
  if (reported && loan.returnReportedAt !== null) {
    const when = fmtWhen(loan.returnReportedAt, now);
    reportedText =
      loan.viewerRole === "owner"
        ? `${firstName(loan.borrower.name)} says it's returned · ${when}`
        : loan.viewerRole === "borrower"
          ? `You reported it returned · ${when}`
          : `${loan.borrower.name} reported it returned · ${when}`;
  }

  return (
    <header className="mt-2 flex flex-wrap items-start gap-x-6 gap-y-4">
      <CategoryTile category={loan.tool.category} size={56} />
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="m-0 font-mono text-xs text-muted-foreground">{loan.ref}</p>
          <h1 className="m-0 font-display text-[clamp(24px,4vw,30px)] leading-[1.15] font-semibold tracking-[-0.01em] text-balance">
            {loan.tool.removed ? (
              loan.tool.name
            ) : (
              <Link href={`/tools/${loan.tool._id}`} className="text-foreground no-underline hover:text-primary">
                {loan.tool.name}
              </Link>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={loan.status} label={loanBadgeLabel(loan, today)} />
          {reported ? <ReturnReportedChip /> : null}
        </div>
        <p className="m-0 flex flex-wrap items-center gap-1.5 text-[15px] tabular">
          <DateRange start={loan.startDate} end={loan.endDate} className={datesClassName(loan.status)} />
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <span className="text-muted-foreground">{fmtDayCount(loan.startDate, loan.endDate)}</span>
          {due ? (
            <>
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
              <Tooltip content={due.abs}>
                <time
                  dateTime={due.date}
                  tabIndex={0}
                  className={cn(
                    "rounded-[4px] font-semibold underline decoration-dotted underline-offset-[3px]",
                    due.danger ? "text-danger" : "text-foreground",
                  )}
                >
                  {due.label}
                </time>
              </Tooltip>
            </>
          ) : null}
        </p>
        {reportedText ? (
          <p className="m-0 flex items-start gap-1.5 font-medium text-warning">
            <Undo2 aria-hidden className="mt-0.5 size-4 shrink-0" />
            {reportedText}
          </p>
        ) : null}
      </div>
      <LoanActionsBar loan={loan} />
    </header>
  );
}

/**
 * Role-based actions. Which buttons exist comes from the server-computed
 * `actions` (owner: approve / decline / mark returned; borrower: cancel /
 * I've returned it; admin non-party: none). Convex re-checks all of it.
 */
function LoanActionsBar({ loan }: { loan: LoanDetailDTO }) {
  const [dialog, setDialog] = useState<"approve" | "decline" | "returned" | "reported" | "cancel" | null>(null);
  const { stale, mark } = useStaleRows();
  const actions = useLoanActions({ onStale: mark });
  const offline = useOffline();
  const isStale = stale.has(loan._id);
  const blocked = offline ? OFFLINE_ACTION_REASON : isStale ? "Refreshing…" : null;
  const a = loan.actions;
  const out = loan.status === "on_loan" || loan.status === "overdue";
  // Borrowers keep seeing "I've returned it" after reporting, disabled with the reason.
  const showReport = loan.viewerRole === "borrower" && out;
  const reportReason = !a.canReportReturned
    ? `Already reported. ${firstName(loan.owner.name)} will mark it returned.`
    : null;

  const buttons = [];
  if (a.canMarkReturned) {
    buttons.push(
      <Button
        key="mark"
        className="flex-1 pr-[18px] pl-4 md:flex-none"
        disabledReason={blocked}
        onClick={() => setDialog("returned")}
      >
        <PackageCheck aria-hidden />
        Mark returned
      </Button>,
    );
  }
  if (a.canApprove) {
    buttons.push(
      <Button
        key="approve"
        className="flex-1 px-4 md:flex-none"
        disabledReason={blocked}
        onClick={() => (loan.overlaps.length ? setDialog("approve") : actions.approve(loan).catch(() => {}))}
      >
        Approve
      </Button>,
    );
  }
  if (a.canDecline) {
    buttons.push(
      <Button
        key="decline"
        variant="outline"
        className="flex-1 px-4 md:flex-none"
        disabledReason={blocked}
        onClick={() => setDialog("decline")}
      >
        Decline
      </Button>,
    );
  }
  if (showReport) {
    buttons.push(
      <Button
        key="report"
        variant="secondary"
        className="flex-1 px-4 md:flex-none"
        disabledReason={blocked ?? reportReason}
        onClick={() => setDialog("reported")}
      >
        I&apos;ve returned it
      </Button>,
    );
  }
  if (a.canCancel) {
    const booking = loan.status === "upcoming";
    buttons.push(
      <Button
        key="cancel"
        variant={booking ? "secondary" : "outline"}
        className="flex-1 px-4 md:flex-none"
        disabledReason={blocked}
        onClick={() => setDialog("cancel")}
      >
        {booking ? "Cancel" : "Cancel request"}
      </Button>,
    );
  }

  const close = (o: boolean) => !o && setDialog(null);

  // Dialogs stay mounted even when the optimistic update hides every button,
  // so a failed confirm can keep its dialog open.
  return (
    <>
      {buttons.length || isStale ? (
        <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
          {buttons.length ? <div className="flex w-full gap-2 md:w-auto">{buttons}</div> : null}
          {isStale ? <StaleNote pending={loan.status === "pending"} /> : null}
        </div>
      ) : null}

      <ApproveOverlapDialog
        open={dialog === "approve"}
        onOpenChange={close}
        borrowerName={loan.borrower.name}
        overlaps={loan.overlaps}
        onConfirm={async () => {
          await actions.approve(loan);
        }}
      />
      <DeclineDialog
        open={dialog === "decline"}
        onOpenChange={close}
        borrowerName={loan.borrower.name}
        onConfirm={(reason) => actions.decline(loan, reason)}
      />
      <MarkReturnedDialog
        open={dialog === "returned"}
        onOpenChange={close}
        toolName={loan.tool.name}
        onConfirm={() => actions.markReturned(loan)}
      />
      <ReportReturnedDialog
        open={dialog === "reported"}
        onOpenChange={close}
        toolName={loan.tool.name}
        ownerName={loan.owner.name}
        onConfirm={() => actions.reportReturned(loan)}
      />
      <CancelRequestDialog
        open={dialog === "cancel"}
        onOpenChange={close}
        toolName={loan.tool.name}
        ownerName={loan.owner.name}
        startDate={loan.startDate}
        endDate={loan.endDate}
        kind={loan.status === "upcoming" ? "booking" : "request"}
        onConfirm={() => actions.cancel(loan)}
      />
    </>
  );
}

// ─── Activity ─────────────────────────────────────────────────────────────

function ActivityCard({ loan, admin }: { loan: LoanDetailDTO; admin: boolean }) {
  const { data, isLoading, error, retry } = useAppQuery(api.loans.timeline, { loanId: loan._id });
  return (
    <section
      aria-labelledby="loan-activity"
      className="min-w-0 rounded-lg border border-border bg-card px-5 pt-5 pb-1 shadow-ll-card"
    >
      <div className="mb-4 flex flex-col gap-0.5">
        <h2 id="loan-activity" className="m-0 text-base font-semibold">
          Activity
        </h2>
        {admin ? (
          <p className="m-0 text-[13px] text-muted-foreground">
            Includes failed attempts and ignored write-backs. Open an automated event for its execution details.
          </p>
        ) : null}
      </div>
      {isLoading ? (
        <ActivityTimelineSkeleton />
      ) : error || !data ? (
        <ErrorState
          variant="banner"
          title="Couldn't load the activity for this loan."
          onRetry={retry}
          className="mb-4"
        />
      ) : (
        <ActivityTimeline events={data} loan={loan} admin={admin} />
      )}
    </section>
  );
}

// ─── People ───────────────────────────────────────────────────────────────

function Party({
  role,
  person,
  isYou,
  contactEmail,
}: {
  role: "Owner" | "Borrower";
  person: PersonDTO;
  isYou: boolean;
  contactEmail: string | null;
}) {
  return (
    <li className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <PersonAvatar initials={person.initials} size="lg" bordered />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-semibold text-muted-foreground">{role}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{person.name}</span>
            {isYou ? <span className="text-muted-foreground">(you)</span> : null}
            {person.trusted ? <TrustedLenderBadge size="md" label="Trusted" /> : null}
          </span>
        </div>
      </div>
      {contactEmail ? (
        <p className="m-0 flex flex-wrap items-center gap-1.5 rounded-md border border-success-border bg-success-bg px-2.5 py-2 text-sm">
          <LockOpen aria-hidden className="size-4 shrink-0 text-success" />
          <span className="font-medium text-success">Contact unlocked ·</span>
          <a href={`mailto:${contactEmail}`} className="font-medium [overflow-wrap:anywhere]">
            {contactEmail}
          </a>
        </p>
      ) : null}
    </li>
  );
}

/**
 * Owner + borrower. The counterpart's email arrives from the server only for
 * a party, only while approved / on loan / overdue; admins never get it.
 */
function PeopleCard({ loan }: { loan: LoanDetailDTO }) {
  const you = loan.adminView ? null : loan.viewerRole;
  return (
    <aside
      aria-labelledby="loan-people"
      className="order-first flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-ll-card min-[960px]:sticky min-[960px]:top-22 min-[960px]:order-none"
    >
      <h2 id="loan-people" className="m-0 text-base font-semibold">
        People
      </h2>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        <Party
          role="Owner"
          person={loan.owner}
          isYou={you === "owner"}
          contactEmail={you === "borrower" ? loan.contactEmail : null}
        />
        <Party
          role="Borrower"
          person={loan.borrower}
          isYou={you === "borrower"}
          contactEmail={you === "owner" ? loan.contactEmail : null}
        />
      </ul>
      {!loan.adminView && !loan.contactEmail ? (
        <p className="m-0 flex items-center gap-1.5 border-t border-border pt-3 text-[13px] text-muted-foreground">
          <Lock aria-hidden className="size-3.5 shrink-0" />
          {CONTACT_LOCKED_NOTE}
        </p>
      ) : null}
    </aside>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────

/** Header + activity placeholders while loans.get loads. */
export function LoanDetailSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading loan"
      className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 sm:px-6 lg:px-8"
    >
      <Skeleton className="h-5 w-28" />
      <div className="mt-4 flex gap-6">
        <Skeleton className="size-14 shrink-0 rounded-lg" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-3/5" />
          <Skeleton className="h-[26px] w-40 rounded-full" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="mt-7 grid items-start gap-6 min-[960px]:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="rounded-lg border border-border bg-card px-5 pt-5 pb-1">
          <Skeleton className="mb-4 h-4 w-20" />
          <ActivityTimelineSkeleton />
        </div>
        <div className="order-first flex flex-col gap-4 rounded-lg border border-border bg-card p-5 min-[960px]:order-none">
          <Skeleton className="h-4 w-16" />
          {[0, 1].map((k) => (
            <div key={k} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
