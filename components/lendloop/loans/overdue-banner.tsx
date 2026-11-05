import { TriangleExclamationPoint } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fmtDay } from "@/lib/domain/dates";
import type { LoanRowDTO } from "@/lib/domain/dto";

/** "You have 1 overdue item: Bosch cordless drill 18V (due Nov 3). Please return it to Rina S." */
export function overdueBannerText(overdue: Pick<LoanRowDTO, "tool" | "endDate" | "owner">[]): string {
  if (overdue.length === 1) {
    const [l] = overdue;
    return `You have 1 overdue item: ${l.tool.name} (due ${fmtDay(l.endDate)}). Please return it to ${l.owner.name}.`;
  }
  return `You have ${overdue.length} overdue items. Please return them to their owners.`;
}

/** Pinned danger banner at the top of My requests while the viewer has overdue borrowings. */
export function OverdueBanner({ overdue }: { overdue: LoanRowDTO[] }) {
  if (!overdue.length) return null;
  return (
    <Alert
      tone="danger"
      role="alert"
      icon={TriangleExclamationPoint}
      className="mb-6"
      action={
        <Button
          asChild
          variant="outline"
          className="border-danger-border text-danger hover:bg-danger-bg hover:text-danger"
        >
          <Link href={`/loans/${overdue[0].ref}`}>View loan</Link>
        </Button>
      }
    >
      {overdueBannerText(overdue)}
    </Alert>
  );
}
