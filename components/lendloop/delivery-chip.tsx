import { Check, CopyX, LoaderCircle, OctagonExclamationPoint, RefreshCw, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { deliveryChipLabel, type DeliveryChipStatus, type DeliveryChipTone } from "@/lib/copy";
import { ERROR_CATEGORY_LABEL, type ErrorCategory } from "@/lib/domain/automation";
import { cn } from "@/lib/utils";

const TONE_ICON: Record<DeliveryChipTone, LucideIcon> = {
  success: Check,
  warning: RefreshCw,
  danger: OctagonExclamationPoint,
  slate: CopyX,
  neutral: LoaderCircle,
};

export type DeliveryChipProps = {
  status: DeliveryChipStatus;
  /** user: "Sent", "Delayed — retrying automatically", "Failed". admin: "Retrying 2/3", "Failed 3/3". */
  audience: "user" | "admin";
  /** Attempt number; shown only when > 1 ("Sent · attempt 2"). */
  attempts?: number;
  maxAttempts?: number;
  /** Admin only: appended as "· timeout". Ignored for users. */
  errorCategory?: ErrorCategory | null;
  className?: string;
};

/** Automation delivery status chip (brief A6): icon + text, 22px, semibold. */
export function DeliveryChip({ status, audience, attempts, maxAttempts, errorCategory, className }: DeliveryChipProps) {
  const { label, tone } = deliveryChipLabel(status, { audience, attempts, maxAttempts });
  const Icon = TONE_ICON[tone];
  const detail = audience === "admin" && errorCategory ? ` · ${ERROR_CATEGORY_LABEL[errorCategory]}` : "";
  return (
    <Badge tone={tone === "neutral" ? "muted" : tone} weight="semibold" className={className}>
      <Icon aria-hidden className={cn(tone === "neutral" && "animate-spin motion-reduce:animate-none")} />
      {label}
      {detail}
    </Badge>
  );
}
