"use client";

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/lendloop/error-state";
import { LoanDetail, LoanDetailSkeleton } from "@/components/lendloop/loans/loan-detail";
import { PageContainer } from "@/components/lendloop/page-header";
import { NotFoundState } from "@/components/lendloop/system-page";
import { api } from "@/convex/_generated/api";
import { clientToday } from "@/lib/config";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { useViewer } from "@/lib/hooks/use-viewer";

/**
 * "/loans/L-1042". The URL carries the human ref, not the Convex id. Anyone
 * who isn't a party (and isn't an admin) gets NOT_FOUND from loans.get and
 * sees the 404 state, never a 403, so refs can't be probed.
 */
export function LoanPage() {
  const { loanId } = useParams<{ loanId: string }>();
  const ref = decodeURIComponent(loanId ?? "");
  const { viewer } = useViewer();
  const { data, isLoading, error, retry } = useAppQuery(api.loans.get, { ref });

  if (isLoading) return <LoanDetailSkeleton />;
  if (error?.code === "NOT_FOUND" || error?.code === "FORBIDDEN") return <NotFoundState />;
  if (error || !data) {
    return (
      <PageContainer>
        <h1 className="sr-only">Loan {ref}</h1>
        <ErrorState
          title="Couldn't load this loan."
          description="Nothing has changed on it. Try again in a moment."
          onRetry={retry}
        />
      </PageContainer>
    );
  }
  return <LoanDetail loan={data} today={clientToday()} viewerIsAdmin={viewer?.role === "admin"} />;
}
