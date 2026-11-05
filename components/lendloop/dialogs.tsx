"use client";

import { Check, Info } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldHint } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { approveOverlapText, firstName, markReturnedTitle, removeImpactText } from "@/lib/copy";
import { DECLINE_REASONS, REMOVE_REASONS, type RemoveReason } from "@/lib/domain/categories";
import { fmtDay, type ISODate } from "@/lib/domain/dates";
import type { AdminListingDTO, LoanRowDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";

/** Shared open-state props. Control `open` from the screen; the dialog calls onOpenChange(false) after a successful confirm. */
type DialogBase = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Runs an async confirm with a busy state. Resolving closes the dialog;
 * throwing keeps it open (the caller already showed a toast).
 */
function useConfirm(onOpenChange: (open: boolean) => void) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onOpenChange(false);
    } catch {
      // Stay open so the user can retry; the screen handles the error toast.
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────

export type ConfirmDialogProps = DialogBase & {
  /** A question: "Cancel this request?", "Delete “Hedge trimmer”?" (destructive titles name the item). */
  title: ReactNode;
  /** The consequence: "Pending requests for it will be cancelled and the requesters notified." */
  description: ReactNode;
  /** Verb label: "Cancel request", "Delete listing", "Mark returned". */
  confirmLabel: string;
  /** Default "Cancel"; e.g. "Keep request", "Not yet". */
  cancelLabel?: string;
  /** primary (teal) or destructive (red). */
  variant?: "primary" | "destructive";
  /** Called on confirm. Return a promise to show the busy state; throw to keep the dialog open. */
  onConfirm: () => void | Promise<void>;
  /** Label while busy, e.g. "Deleting…" (defaults to confirmLabel). */
  busyLabel?: string;
  /** Extra content between the description and the buttons. */
  children?: ReactNode;
  size?: "md" | "lg" | "xl";
};

/** Question title + consequence + verb button (brief A8). alertdialog semantics; bottom sheet on mobile. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "primary",
  onConfirm,
  busyLabel,
  children,
  size = "md",
}: ConfirmDialogProps) {
  const { busy, run } = useConfirm(onOpenChange);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent alert size={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant={variant === "destructive" ? "destructive" : "primary"}
            loading={busy}
            loadingLabel={busyLabel}
            onClick={() => run(onConfirm)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Loan dialogs ─────────────────────────────────────────────────────────

export type CancelRequestDialogProps = DialogBase & {
  toolName: string;
  ownerName: string;
  startDate: ISODate;
  endDate: ISODate;
  /** "booking" for an approved loan that hasn't started, "request" while pending. */
  kind: "request" | "booking";
  onConfirm: () => void | Promise<void>;
};

/** Borrower cancels: "Cancel this request?" [Keep request] [Cancel request]. */
export function CancelRequestDialog({
  toolName,
  ownerName,
  startDate,
  endDate,
  kind,
  ...rest
}: CancelRequestDialogProps) {
  return (
    <ConfirmDialog
      {...rest}
      title="Cancel this request?"
      description={`Your ${kind} for ${toolName}, ${fmtDay(startDate)} → ${fmtDay(endDate)}, will be cancelled and ${ownerName} will be told.`}
      cancelLabel="Keep request"
      confirmLabel="Cancel request"
      busyLabel="Cancelling…"
      variant="destructive"
    />
  );
}

export type DeleteListingDialogProps = DialogBase & {
  toolName: string;
  /** Pending requests that will be auto-cancelled. */
  pendingCount: number;
  onConfirm: () => void | Promise<void>;
};

/** Owner deletes a listing: "Delete “X”?" [Cancel] [Delete listing]. */
export function DeleteListingDialog({ toolName, pendingCount, ...rest }: DeleteListingDialogProps) {
  return (
    <ConfirmDialog
      {...rest}
      title={`Delete “${toolName}”?`}
      description={
        pendingCount
          ? `Pending requests for it will be cancelled and the requesters notified (${pendingCount} right now).`
          : "Pending requests for it will be cancelled and the requesters notified."
      }
      confirmLabel="Delete listing"
      busyLabel="Deleting…"
      variant="destructive"
    />
  );
}

export type ApproveOverlapDialogProps = DialogBase & {
  borrowerName: string;
  /** LoanRowDTO.overlaps of the request being approved. */
  overlaps: LoanRowDTO["overlaps"];
  onConfirm: () => void | Promise<void>;
};

/**
 * Shown before approving a request that overlaps others: "Approve Sam R.'s request?"
 * Approving auto-declines the overlaps with "Dates taken".
 */
export function ApproveOverlapDialog({ borrowerName, overlaps, ...rest }: ApproveOverlapDialogProps) {
  return (
    <ConfirmDialog
      {...rest}
      size="lg"
      title={`Approve ${borrowerName}'s request?`}
      description={approveOverlapText(overlaps)}
      confirmLabel="Approve & decline others"
      busyLabel="Approving…"
    />
  );
}

export type MarkReturnedDialogProps = DialogBase & {
  toolName: string;
  onConfirm: () => void | Promise<void>;
};

/** Owner closes a loan: "Mark Bosch cordless drill 18V as returned?" */
export function MarkReturnedDialog({ toolName, ...rest }: MarkReturnedDialogProps) {
  return (
    <ConfirmDialog
      {...rest}
      title={markReturnedTitle(toolName)}
      description="This closes the loan and stops reminders."
      confirmLabel="Mark returned"
      busyLabel="Saving…"
    />
  );
}

export type ReportReturnedDialogProps = DialogBase & {
  toolName: string;
  ownerName: string;
  onConfirm: () => void | Promise<void>;
};

/** Borrower says it's back: notification only, the owner still marks it returned. */
export function ReportReturnedDialog({ toolName, ownerName, ...rest }: ReportReturnedDialogProps) {
  const first = firstName(ownerName);
  return (
    <ConfirmDialog
      {...rest}
      title={`Let ${first} know you've returned the ${toolName}?`}
      description={`Only ${first} can mark the loan returned.`}
      cancelLabel="Not yet"
      confirmLabel="Yes, I've returned it"
      busyLabel="Sending…"
    />
  );
}

// ─── DeclineDialog ────────────────────────────────────────────────────────

export type DeclineDialogProps = DialogBase & {
  borrowerName: string;
  /** Receives the picked preset reason, or null (reason is optional). */
  onConfirm: (reason: string | null) => void | Promise<void>;
};

/** Owner declines with an optional preset reason the borrower will see. */
export function DeclineDialog({ open, onOpenChange, borrowerName, onConfirm }: DeclineDialogProps) {
  const [reason, setReason] = useState<string | null>(null);
  const { busy, run } = useConfirm(onOpenChange);
  const helpId = useId();
  const change = (o: boolean) => {
    if (busy) return;
    if (!o) setReason(null);
    onOpenChange(o);
  };
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent size="xl" className="gap-4" aria-describedby={undefined}>
        <DialogTitle>{`Decline ${borrowerName}'s request?`}</DialogTitle>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 font-semibold">
            Reason <span className="font-normal text-muted-foreground">(optional)</span>
          </legend>
          <div role="group" aria-label="Reason" aria-describedby={helpId} className="flex flex-wrap gap-2">
            {DECLINE_REASONS.map((r) => {
              const on = reason === r;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setReason(on ? null : r)}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 font-medium md:min-h-9",
                    on ? "border-primary bg-primary-subtle" : "border-control-border bg-card hover:border-primary",
                  )}
                >
                  {on ? <Check aria-hidden className="size-3.5 text-primary" /> : null}
                  {r}
                </button>
              );
            })}
          </div>
          <p id={helpId} className="m-0 mt-1 text-[13px] text-muted-foreground">
            {`${firstName(borrowerName)} will see the reason you pick.`}
          </p>
        </fieldset>
        <DialogFooter className="mt-0">
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" loading={busy} loadingLabel="Declining…" onClick={() => run(() => onConfirm(reason))}>
            Decline request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── RemoveListingDialog (admin) ──────────────────────────────────────────

export type RemoveListingDialogProps = DialogBase & {
  /** The row being removed (name, owner, impact). */
  listing: Pick<AdminListingDTO, "name" | "owner" | "impact">;
  /** detail is required (trimmed, non-empty) when reason is "Other", null otherwise. */
  onConfirm: (input: { reason: RemoveReason; detail: string | null }) => void | Promise<void>;
};

/**
 * Admin removal: required reason, "Other" reveals required details, impact
 * summary, and a red "Remove listing" that explains why it's blocked until valid.
 */
export function RemoveListingDialog({ open, onOpenChange, listing, onConfirm }: RemoveListingDialogProps) {
  const [reason, setReason] = useState<RemoveReason | "">("");
  const [detail, setDetail] = useState("");
  const { busy, run } = useConfirm(onOpenChange);
  const ids = { reason: useId(), detail: useId(), help: useId() };
  const isOther = reason === "Other";
  const blocked = !reason ? "Choose a reason first." : isOther && !detail.trim() ? "Add details for “Other”." : null;

  const change = (o: boolean) => {
    if (busy) return;
    if (!o) {
      setReason("");
      setDetail("");
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent size="xl" className="gap-4" aria-describedby={ids.help}>
        <DialogTitle>{`Remove “${listing.name}” by ${listing.owner.name}?`}</DialogTitle>
        <Field>
          <Label htmlFor={ids.reason} hint="(required)">
            Reason
          </Label>
          <NativeSelect
            id={ids.reason}
            required
            value={reason}
            placeholderShown={!reason}
            aria-describedby={ids.help}
            onChange={(e) => setReason(e.target.value as RemoveReason)}
            wrapperClassName="flex"
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {REMOVE_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {isOther ? (
          <Field>
            <Label htmlFor={ids.detail} hint="(required)">
              Details
            </Label>
            <Textarea
              id={ids.detail}
              required
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="What should the owner know?"
            />
          </Field>
        ) : null}
        <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted px-3.5 py-3">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="m-0 tabular text-pretty">{removeImpactText(listing.impact)}</p>
        </div>
        <FieldHint id={ids.help}>
          The owner will see the reason. The listing is hidden, not deleted, so history is kept.
        </FieldHint>
        <DialogFooter className="mt-0">
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabledReason={blocked}
            loading={busy}
            loadingLabel="Removing…"
            onClick={() =>
              reason && run(() => onConfirm({ reason, detail: isOther ? detail.trim() : null }))
            }
          >
            Remove listing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
