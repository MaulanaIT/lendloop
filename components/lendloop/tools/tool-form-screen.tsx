"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { ErrorState } from "@/components/lendloop/error-state";
import { PageContainer } from "@/components/lendloop/page-header";
import { FORBIDDEN_COPY, ForbiddenPage, NotFoundState } from "@/components/lendloop/system-page";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { useViewer } from "@/lib/hooks/use-viewer";
import { ToolForm } from "./tool-form";

function FormPageHeader({
  back,
  title,
  subtitle,
}: {
  back: { label: string; href: string };
  title: string;
  subtitle: ReactNode;
}) {
  return (
    <>
      <Link
        href={back.href}
        className="inline-flex min-h-11 items-center gap-1.5 font-medium text-muted-foreground no-underline hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {back.label}
      </Link>
      <div className="mt-1 mb-7 flex flex-col gap-1">
        <h1 id="form-h" className="m-0 font-display text-[clamp(26px,4vw,30px)] font-semibold tracking-[-0.01em]">
          {title}
        </h1>
        <p className="m-0 text-base text-muted-foreground">{subtitle}</p>
      </div>
    </>
  );
}

function FormSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading form" className="flex max-w-[560px] flex-col gap-6">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-[120px]" />
          <Skeleton className="h-11 rounded-md" />
        </div>
      ))}
      <Skeleton className="h-11 w-[180px] rounded-md" />
    </div>
  );
}

/** "/tools/new" (brief B5). */
export function NewToolScreen() {
  const { viewer } = useViewer();
  return (
    <PageContainer className="pt-4">
      <FormPageHeader
        back={{ label: "Browse", href: "/tools" }}
        title="List a tool"
        subtitle="Neighbors can request it as soon as it’s published."
      />
      <ToolForm mode="new" viewerInitials={viewer?.initials ?? ""} />
    </PageContainer>
  );
}

/**
 * "/tools/[toolId]/edit". tools.getForEdit returns FORBIDDEN unless the viewer
 * owns the listing (admins included), so the 403 here mirrors a server rule.
 */
export function EditToolScreen() {
  const { toolId } = useParams<{ toolId: string }>();
  const { viewer } = useViewer();
  const { data, isLoading, error, retry } = useAppQuery(api.tools.getForEdit, { toolId });

  if (error?.code === "FORBIDDEN") return <ForbiddenPage {...FORBIDDEN_COPY.editListing(toolId)} />;
  if (error?.code === "NOT_FOUND") return <NotFoundState />;

  return (
    <PageContainer className="pt-4">
      <FormPageHeader
        back={{ label: "Back to tool", href: `/tools/${toolId}` }}
        title="Edit listing"
        subtitle={data ? data.name : isLoading ? <span className="invisible">Loading</span> : null}
      />
      {isLoading ? (
        <FormSkeleton />
      ) : error || !data ? (
        <ErrorState
          className="max-w-[560px]"
          title="Couldn't load this form"
          description="Nothing was saved. Try again in a moment."
          onRetry={retry}
        />
      ) : (
        <>
          {data.hasActiveLoan ? (
            <Alert tone="warning" className="mb-6 max-w-[560px] px-3.5 py-3">
              This tool is on loan. Changes are visible to the current borrower.
            </Alert>
          ) : null}
          <ToolForm
            // Seeded once from the server; live updates never overwrite what the owner is typing.
            key={data._id}
            mode="edit"
            toolId={data._id}
            initial={{
              name: data.name,
              category: data.category,
              condition: data.condition,
              description: data.description,
            }}
            previewAvailability={data.hasActiveLoan ? { kind: "on_loan", until: null } : undefined}
            viewerInitials={viewer?.initials ?? ""}
          />
        </>
      )}
    </PageContainer>
  );
}
