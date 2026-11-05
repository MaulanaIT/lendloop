import { Check, Zap } from "lucide-react";
import { automationLineText, delayedNotificationNote } from "@/lib/copy";
import type { AutomationLineDTO, LoanRowDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";

export type NoticeTone = "success" | "warning" | "danger" | "reported";
export type Notice = { tone: NoticeTone; text: string; check: boolean };

const TONE: Record<NoticeTone, string> = {
  success: "border-success-border bg-success-bg text-success",
  warning: "border-warning-border bg-warning-bg text-warning",
  danger: "border-danger-border bg-danger-bg text-danger",
  reported: "border-[var(--st-reported-border)] bg-[var(--st-reported-bg)] text-[var(--st-reported-text)]",
};

/** Boxed "⚡ Automated · Owner notified ✓" used in the tool page's request panel. */
export function AutomationNotice({ notice, className }: { notice: Notice; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2.5 text-[13px] leading-[1.45]",
        TONE[notice.tone],
        className,
      )}
    >
      <Zap aria-hidden className="mt-px size-4 shrink-0" />
      <span className="flex-1">
        <span className="font-semibold">Automated</span>
        <span aria-hidden> · </span>
        <span className="sr-only">: </span>
        {notice.text}
      </span>
      {notice.check ? <Check aria-hidden className="mt-px size-4 shrink-0" /> : null}
    </div>
  );
}

function fromLine(a: AutomationLineDTO, nowMs: number): Notice {
  const { text, tone, check } = automationLineText(a, nowMs);
  if (tone === "warning") return { tone: "warning", text, check };
  if (tone === "danger") return { tone: "danger", text, check };
  return { tone: a.status === "sent" ? "success" : "reported", text, check };
}

/**
 * What the borrower sees about the automation on their own loan:
 * pending → "Notifying owner…" → "Owner notified ✓", or the delayed note
 * (brief A4/A6); overdue → the latest reminder. Null when there's nothing to say.
 */
export function borrowerNotice(row: LoanRowDTO, nowMs: number): Notice | null {
  const a = row.lastAutomation;
  if (row.status === "pending") {
    if (!a || a.status === "queued" || a.status === "accepted") {
      return { tone: "reported", text: "Notifying owner…", check: false };
    }
    if (a.status === "retrying") return { tone: "warning", text: delayedNotificationNote(row.owner.name), check: false };
    return fromLine(a, nowMs);
  }
  // lastReminder, not lastAutomation: a later "return reported" notice must not
  // hide the reminder (same rule as My requests' request-row).
  if (row.status === "overdue" && row.lastReminder) return fromLine(row.lastReminder, nowMs);
  return null;
}

/** Owner's current-loan box: only the overdue reminder is worth surfacing there. */
export function ownerNotice(row: LoanRowDTO, nowMs: number): Notice | null {
  if (row.status === "overdue" && row.lastReminder) return fromLine(row.lastReminder, nowMs);
  return null;
}
