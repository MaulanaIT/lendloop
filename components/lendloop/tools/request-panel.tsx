"use client";

import { useMutation } from "convex/react";
import {
  Ban,
  CalendarX,
  Check,
  ChevronRight,
  Clock,
  PackageCheck,
  Pencil,
  Trash,
  TriangleExclamationPoint,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useOffline } from "@/components/lendloop/banners";
import {
  DateRangePicker,
  rangeSelectionError,
  type DateRangeValue,
} from "@/components/lendloop/date-range-picker";
import { CancelRequestDialog, MarkReturnedDialog, ReportReturnedDialog } from "@/components/lendloop/dialogs";
import { DayDate, ShortRange } from "@/components/lendloop/relative-time";
import { ReturnReportedChip, StatusBadge } from "@/components/lendloop/status-badge";
import { useNow } from "@/components/lendloop/use-now";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { OFFLINE_ACTION_REASON, TOAST_COPY, firstName, loanBadgeLabel } from "@/lib/copy";
import { fmtRelative, type ISODate } from "@/lib/domain/dates";
import type { LoanRowDTO, ToolDetailDTO } from "@/lib/domain/dto";
import { parseAppError } from "@/lib/domain/errors";
import { APP_TIME_ZONE } from "@/lib/config";
import { toast, toastAppError } from "@/lib/toast";
import { AutomationNotice, borrowerNotice, ownerNotice } from "./automation-notice";
import { DeleteToolDialog } from "./tool-dialogs";

const H2 = "m-0 font-display text-xl leading-[1.25] font-semibold";

export type RequestPanelProps = {
  tool: ToolDetailDTO;
  today: ISODate;
  /** Viewer's active loan on this tool (pending / approved / on loan / overdue); undefined while loading. */
  myLoan: LoanRowDTO | null | undefined;
  /** Owner only: the loan currently out (on loan / overdue); undefined while loading. */
  ownerLoan: LoanRowDTO | null | undefined;
  /** Ref of the request sent from this page, for the "Request sent" confirmation. */
  justSentRef: string | null;
  onSent: (ref: string) => void;
  onDeleted: () => void;
};

/**
 * Right-hand panel of the tool page (brief B4), one variant per situation:
 * owner → "This is your tool"; borrower with an open loan → its status;
 * tool still out past its due date → blocked; otherwise the request form.
 * Variants are UI only; every action is re-authorized by Convex.
 */
export function RequestPanelContent(props: RequestPanelProps) {
  const { tool, myLoan } = props;
  if (tool.viewer.isOwner) return <OwnerPanel {...props} />;
  if (myLoan === undefined) return <PanelSkeleton />;
  if (myLoan) return <MyLoanPanel {...props} row={myLoan} />;
  // Non-owners see an overdue tool as plain "On loan" with no date.
  const stillOut =
    tool.availability.kind === "overdue" || (tool.availability.kind === "on_loan" && tool.availability.until === null);
  if (stillOut) return <BlockedPanel tool={tool} />;
  return <RequestForm {...props} />;
}

/** Label for the mobile sticky bar's button. */
export function mobileBarLabel(tool: ToolDetailDTO, myLoan: LoanRowDTO | null | undefined): string {
  if (tool.viewer.isOwner) return "Manage";
  if (myLoan) return myLoan.status === "on_loan" || myLoan.status === "overdue" ? "View loan" : "View request";
  return "Request to borrow";
}

function PanelSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3">
      <Skeleton className="h-5 w-[55%]" />
      <Skeleton className="h-[52px] rounded-md" />
      <Skeleton className="h-11 rounded-md" />
    </div>
  );
}

// ─── (a) Request form ─────────────────────────────────────────────────────

function RequestForm({ tool, today, onSent }: RequestPanelProps) {
  const request = useMutation(api.loans.request);
  const offline = useOffline();
  const [value, setValue] = useState<DateRangeValue>({ start: null, end: null });
  const [serverError, setServerError] = useState<ReactNode>(null);
  const [sending, setSending] = useState(false);
  const owner = firstName(tool.owner.name);

  // Fast client feedback only; loans.request re-validates range, overlap and duplicates.
  const rangeError = rangeSelectionError(value, tool.bookedRanges, today);
  const blockedReason = offline
    ? OFFLINE_ACTION_REASON
    : !value.start || !value.end
      ? "Pick a start and an end date first."
      : rangeError;

  const send = async () => {
    if (!value.start || !value.end || blockedReason) return;
    setSending(true);
    try {
      const { ref } = await request({ toolId: tool._id, startDate: value.start, endDate: value.end });
      toast.success(TOAST_COPY.requestSent(tool.owner.name));
      onSent(ref);
    } catch (err) {
      const e = parseAppError(err);
      switch (e.code) {
        case "DATES_TAKEN":
          // Someone was approved for these days meanwhile; the calendar is live, so just reset.
          setValue({ start: null, end: null });
          setServerError("Those dates were just booked. Pick new dates.");
          toast.error("Those dates were just booked. Pick new dates.", {
            description: "The calendar has been refreshed.",
            icon: CalendarX,
          });
          break;
        case "DUPLICATE_REQUEST":
          setServerError(
            <>
              You already have a pending request for this tool.{" "}
              <Link href="/me/requests" className="font-semibold text-danger underline underline-offset-[3px]">
                View request
              </Link>
            </>,
          );
          break;
        case "OWN_TOOL":
        case "VALIDATION":
          setServerError(e.copy);
          break;
        default:
          toastAppError(err, { onRetry: send });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <h2 className={H2}>Request to borrow</h2>
      <DateRangePicker
        value={value}
        onChange={(v) => {
          setValue(v);
          setServerError(null);
        }}
        bookedRanges={tool.bookedRanges}
        today={today}
        months={1}
        showLegend={false}
        error={serverError ?? undefined}
      />
      <Button className="w-full" loading={sending} loadingLabel="Sending…" disabledReason={blockedReason} onClick={send}>
        Send request
      </Button>
      <p className="m-0 text-[13px] text-muted-foreground text-pretty">
        {owner} will be notified. Your contact details are shared only if the request is approved.
      </p>
    </>
  );
}

// Tool still out past its due date: nothing can be requested until the owner marks it returned.
function BlockedPanel({ tool }: { tool: ToolDetailDTO }) {
  const owner = firstName(tool.owner.name);
  return (
    <>
      <h2 className={H2}>Request to borrow</h2>
      <div className="flex items-start gap-2.5 rounded-md bg-muted p-3">
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="m-0">
          This tool hasn&apos;t come back from its last loan yet. You can request dates once {owner} marks it returned.
        </p>
      </div>
      <Button className="w-full" disabledReason={`Not available until ${owner} marks it returned.`}>
        Send request
      </Button>
    </>
  );
}

// ─── (b) The viewer's own request / loan ──────────────────────────────────

function MyLoanPanel({ tool, today, row, justSentRef }: RequestPanelProps & { row: LoanRowDTO }) {
  const now = useNow();
  const offline = useOffline();
  const cancel = useMutation(api.loans.cancel);
  const reportReturned = useMutation(api.loans.reportReturned);
  const [dialog, setDialog] = useState<"cancel" | "returned" | null>(null);
  const owner = firstName(tool.owner.name);
  const range = <ShortRange start={row.startDate} end={row.endDate} />;
  const notice = borrowerNotice(row, now);
  const out = row.status === "on_loan" || row.status === "overdue";
  const offlineReason = offline ? OFFLINE_ACTION_REASON : null;

  const { heading, meta } = (() => {
    switch (row.status) {
      case "pending":
        return {
          heading: <>You requested {range}</>,
          meta: `Sent ${fmtRelative(row.createdAt, now, APP_TIME_ZONE)}. Nothing is booked until ${owner} approves.`,
        };
      case "upcoming":
        return {
          heading: <>You&apos;re booked {range}</>,
          meta: `Contact is unlocked so you can arrange the handover with ${owner}.`,
        };
      case "overdue":
        return {
          heading: (
            <>
              Due back <DayDate date={row.endDate} />
            </>
          ),
          meta: `Please return it to ${owner}; they'll mark it returned.`,
        };
      default:
        return {
          heading: (
            <>
              You have it until <DayDate date={row.endDate} />
            </>
          ),
          meta: `${owner} marks it returned when it's back.`,
        };
    }
  })();

  return (
    <>
      {justSentRef === row.ref ? (
        <div className="flex animate-ll-in items-center gap-2.5">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-success-bg text-success">
            <Check className="size-4" />
          </span>
          <p role="status" className="m-0 text-[15px] font-semibold">
            Request sent — {owner} will be notified.
          </p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2.5">
        <h2 className={H2}>{heading}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row.status} label={loanBadgeLabel(row, today)} />
          {row.returnReportedAt ? <ReturnReportedChip /> : null}
          <span className="ml-auto font-mono text-xs text-muted-foreground">{row.ref}</span>
        </div>
      </div>
      <p className="m-0 text-muted-foreground text-pretty">{meta}</p>
      {notice ? <AutomationNotice notice={notice} /> : null}

      {out ? (
        <div className="flex flex-wrap gap-2">
          <Button
            className="flex-1 [&_svg]:size-5"
            disabledReason={offlineReason ?? (row.returnReportedAt ? `Already reported. ${owner} will mark it returned.` : null)}
            onClick={() => setDialog("returned")}
          >
            <Undo2 aria-hidden />
            I&apos;ve returned it
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/loans/${row.ref}`}>View loan</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="flex-1">
            <Link href="/me/requests">View request</Link>
          </Button>
          <Button
            variant="destructive-outline"
            className="flex-1"
            disabledReason={offlineReason}
            onClick={() => setDialog("cancel")}
          >
            Cancel request
          </Button>
        </div>
      )}

      <CancelRequestDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !o && setDialog(null)}
        toolName={tool.name}
        ownerName={tool.owner.name}
        startDate={row.startDate}
        endDate={row.endDate}
        kind={row.status === "upcoming" ? "booking" : "request"}
        onConfirm={async () => {
          try {
            await cancel({ loanId: row._id });
          } catch (err) {
            toastAppError(err);
            throw err;
          }
          toast.message("Request cancelled.", { icon: Ban });
        }}
      />
      <ReportReturnedDialog
        open={dialog === "returned"}
        onOpenChange={(o) => !o && setDialog(null)}
        toolName={tool.name}
        ownerName={tool.owner.name}
        onConfirm={async () => {
          try {
            await reportReturned({ loanId: row._id });
          } catch (err) {
            toastAppError(err);
            throw err;
          }
          toast.success(TOAST_COPY.reportedReturned(tool.owner.name));
        }}
      />
    </>
  );
}

// ─── (c) Owner ────────────────────────────────────────────────────────────

function OwnerPanel({ tool, today, ownerLoan, onDeleted }: RequestPanelProps) {
  const now = useNow();
  const offline = useOffline();
  const markReturned = useMutation(api.loans.markReturned);
  const [deleting, setDeleting] = useState(false);
  const [marking, setMarking] = useState(false);
  const pending = tool.pendingRequests ?? [];

  return (
    <>
      <h2 className={H2}>This is your tool</h2>
      <div className="flex gap-2">
        <Button asChild variant="outline" className="flex-1 [&_svg]:size-5">
          <Link href={`/tools/${tool._id}/edit`}>
            <Pencil aria-hidden />
            Edit
          </Link>
        </Button>
        <Button
          variant="destructive-outline"
          className="flex-1 [&_svg]:size-5"
          // Mirrors the server rule; tools.remove refuses with HAS_ACTIVE_LOAN anyway.
          disabledReason={offline ? OFFLINE_ACTION_REASON : tool.viewer.deleteBlockedReason}
          onClick={() => setDeleting(true)}
        >
          <Trash aria-hidden />
          Delete
        </Button>
      </div>

      {ownerLoan ? (
        <div className="flex flex-col gap-2.5 rounded-tile border border-border p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ownerLoan.status} label={loanBadgeLabel(ownerLoan, today)} />
            {ownerLoan.returnReportedAt ? <ReturnReportedChip /> : null}
            <span className="ml-auto font-mono text-xs text-muted-foreground">{ownerLoan.ref}</span>
          </div>
          <p className="m-0 tabular">
            <span className="font-semibold">{ownerLoan.borrower.name}</span>
            <span className="text-muted-foreground">
              {" · "}
              <ShortRange start={ownerLoan.startDate} end={ownerLoan.endDate} />
            </span>
          </p>
          {ownerLoan.returnReportedAt ? (
            <p className="m-0 text-muted-foreground text-pretty">
              {ownerLoan.borrower.name} said they returned it {fmtRelative(ownerLoan.returnReportedAt, now, APP_TIME_ZONE)}.
              Check it&apos;s back, then mark it returned.
            </p>
          ) : null}
          {(() => {
            const notice = ownerNotice(ownerLoan, now);
            return notice ? <AutomationNotice notice={notice} /> : null;
          })()}
          <Button
            className="self-start [&_svg]:size-5"
            disabledReason={offline ? OFFLINE_ACTION_REASON : null}
            onClick={() => setMarking(true)}
          >
            <PackageCheck aria-hidden />
            Mark returned
          </Button>
          <MarkReturnedDialog
            open={marking}
            onOpenChange={setMarking}
            toolName={tool.name}
            onConfirm={async () => {
              try {
                await markReturned({ loanId: ownerLoan._id });
              } catch (err) {
                toastAppError(err);
                throw err;
              }
              toast.success(TOAST_COPY.markedReturned);
            }}
          />
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="flex flex-col">
          <h3 className="m-0 mb-1 flex items-center gap-2 text-[15px] font-semibold">
            <StatusBadge status="pending" label="Pending" size="sm" className="h-6" />
            {pending.length} pending {pending.length === 1 ? "request" : "requests"}
          </h3>
          <ul className="m-0 list-none p-0">
            {pending.map((r) => {
              const other = pending.find(
                (x) => x.loanId !== r.loanId && x.startDate <= r.endDate && r.startDate <= x.endDate,
              );
              const overlap = other ? (
                <ShortRange
                  start={r.startDate > other.startDate ? r.startDate : other.startDate}
                  end={r.endDate < other.endDate ? r.endDate : other.endDate}
                />
              ) : null;
              return (
                <li key={r.loanId} className="border-t border-border">
                  <Link
                    href="/me/incoming"
                    className="-mx-2 flex min-h-11 items-center gap-2.5 rounded-md px-2 py-3 text-foreground no-underline hover:bg-muted hover:text-foreground"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-medium">{r.borrower.name}</span>
                      <span className="text-[13px] text-muted-foreground tabular">
                        <ShortRange start={r.startDate} end={r.endDate} /> ·{" "}
                        {fmtRelative(r.createdAt, now, APP_TIME_ZONE)}
                      </span>
                    </span>
                    {overlap ? (
                      <Badge tone="warning" size="sm" className="tabular">
                        <TriangleExclamationPoint aria-hidden className="size-3.5" />
                        Overlaps {overlap}
                      </Badge>
                    ) : null}
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {ownerLoan === null && pending.length === 0 ? (
        <p className="m-0 text-muted-foreground">Not on loan and no pending requests.</p>
      ) : null}

      <DeleteToolDialog
        tool={deleting ? { _id: tool._id, name: tool.name } : null}
        pendingCount={pending.length}
        onOpenChange={(o) => !o && setDeleting(false)}
        onDeleted={onDeleted}
      />
    </>
  );
}
