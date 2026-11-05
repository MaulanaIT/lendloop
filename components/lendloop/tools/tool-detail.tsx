"use client";

import { SearchX } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AvailabilityPill } from "@/components/lendloop/availability-pill";
import { ErrorState } from "@/components/lendloop/error-state";
import { PageContainer } from "@/components/lendloop/page-header";
import { StatusBadge } from "@/components/lendloop/status-badge";
import { ForbiddenPage, NotFoundState, SystemState } from "@/components/lendloop/system-page";
import { useIsDesktop } from "@/components/lendloop/use-media-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import { clientToday } from "@/lib/config";
import { loanBadgeLabel } from "@/lib/copy";
import type { LoanRowDTO } from "@/lib/domain/dto";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { AdminActions } from "./admin-actions";
import { RequestPanelContent, mobileBarLabel, type RequestPanelProps } from "./request-panel";
import { AvailabilitySection, OwnerBlock, ToolDetailSkeleton, ToolHeader } from "./tool-overview";

const ACTIVE: LoanRowDTO["status"][] = ["pending", "upcoming", "on_loan", "overdue"];

/** "/tools/[toolId]" (brief B4): details, owner, availability and the role-specific request panel. */
export function ToolDetail() {
  const { toolId } = useParams<{ toolId: string }>();
  const router = useRouter();
  const today = clientToday();
  const desktop = useIsDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [justSentRef, setJustSentRef] = useState<string | null>(null);
  // Set right before navigating away after a delete/remove, so the live query
  // flipping to NOT_FOUND doesn't flash the 404 page.
  const [leaving, setLeaving] = useState(false);

  const { data: tool, isLoading, error, retry } = useAppQuery(api.tools.get, { toolId });
  const isOwner = tool?.viewer.isOwner;
  // Borrower view: the viewer's own open loan on this tool (status, automation, unlocked contact).
  const mine = useAppQuery(api.loans.myRequests, tool && !isOwner ? {} : "skip");
  // Owner view: the loan that's currently out, for "Mark returned".
  const incoming = useAppQuery(api.loans.incoming, tool && isOwner ? {} : "skip");

  if (leaving || isLoading) {
    return (
      <PageContainer className="pt-5">
        <ToolDetailSkeleton />
      </PageContainer>
    );
  }
  if (error?.code === "NOT_FOUND") {
    return (
      <SystemState
        icon={SearchX}
        code="404"
        title="This tool isn't available anymore."
        action={{ label: "Browse tools", href: "/tools" }}
      />
    );
  }
  if (error?.code === "FORBIDDEN") {
    return <ForbiddenPage title={error.copy} action={{ label: "Back to the board", href: "/tools" }} />;
  }
  if (error || !tool) {
    if (!error) return <NotFoundState />;
    return (
      <PageContainer className="pt-5">
        <ErrorState
          title={
            <span role="heading" aria-level={1}>
              Couldn&apos;t load this tool
            </span>
          }
          description="Something went wrong on our side. Try again in a moment."
          onRetry={retry}
        />
      </PageContainer>
    );
  }

  const myLoan = isOwner
    ? null
    : mine.data
      ? (mine.data.find((r) => r.tool._id === tool._id && ACTIVE.includes(r.status)) ?? null)
      : mine.error
        ? null
        : undefined;
  const ownerLoan = !isOwner
    ? null
    : incoming.data
      ? (incoming.data.find((r) => r.tool._id === tool._id && (r.status === "on_loan" || r.status === "overdue")) ??
        null)
      : incoming.error
        ? null
        : undefined;
  const contactEmail = myLoan && myLoan.status !== "pending" ? myLoan.contactEmail : null;

  const leave = () => {
    setLeaving(true);
    router.push("/tools");
  };
  const panel: RequestPanelProps = {
    tool,
    today,
    myLoan,
    ownerLoan,
    justSentRef,
    onSent: setJustSentRef,
    onDeleted: leave,
  };

  return (
    // Mobile: the layout already clears the tab bar; this adds room for the sticky request bar on top of it.
    <PageContainer className="pt-5 pb-24 md:pb-16">
      <div className="grid items-start gap-[clamp(24px,4vw,48px)] min-[960px]:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-7">
          <ToolHeader tool={tool} today={today} />
          <OwnerBlock tool={tool} contactEmail={contactEmail} />
          <AvailabilitySection tool={tool} today={today} />
        </div>

        <div className="flex min-w-0 flex-col gap-4 min-[960px]:sticky min-[960px]:top-[88px]">
          {desktop ? (
            <aside
              aria-label="Borrowing"
              className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-ll-card"
            >
              <RequestPanelContent {...panel} />
            </aside>
          ) : null}
          {tool.viewer.canRemove ? <AdminActions tool={tool} onRemoved={leave} /> : null}
        </div>
      </div>

      {!desktop ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-[29] flex items-center gap-3 border-t border-border bg-card px-4 py-2.5">
            <span className="flex min-w-0 flex-1">
              {myLoan ? (
                <StatusBadge status={myLoan.status} label={loanBadgeLabel(myLoan, today)} size="sm" className="truncate" />
              ) : (
                <AvailabilityPill availability={tool.availability} today={today} className="max-w-full truncate" />
              )}
            </span>
            <Button size="lg" className="px-[18px]" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
              {mobileBarLabel(tool, myLoan)}
            </Button>
          </div>
          <SheetContent side="right" aria-describedby={undefined}>
            <SheetHeader closeLabel="Close" className="items-center py-1 pl-4">
              <SheetTitle className="font-sans text-[13px] font-medium text-muted-foreground">{tool.name}</SheetTitle>
            </SheetHeader>
            <section aria-label="Borrowing" className="flex min-w-0 flex-col gap-4 px-4 pt-4 pb-8">
              <RequestPanelContent {...panel} />
            </section>
          </SheetContent>
        </Sheet>
      ) : null}
    </PageContainer>
  );
}
