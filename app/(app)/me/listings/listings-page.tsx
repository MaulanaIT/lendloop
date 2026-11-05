"use client";

import { useMutation } from "convex/react";
import { PackagePlus, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useOffline } from "@/components/lendloop/banners";
import { DeleteListingDialog } from "@/components/lendloop/dialogs";
import { EmptyState } from "@/components/lendloop/empty-state";
import { ErrorState } from "@/components/lendloop/error-state";
import { ListingRow, ListingRowsSkeleton, ListingTableHeader } from "@/components/lendloop/loans/listing-row";
import { PageContainer, PageHeader } from "@/components/lendloop/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TOAST_COPY } from "@/lib/copy";
import { clientToday } from "@/lib/config";
import type { MyListingDTO } from "@/lib/domain/dto";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { toast, toastAppError } from "@/lib/toast";

function ListToolButton({ className }: { className?: string }) {
  return (
    <Button asChild className={className}>
      <Link href="/tools/new">
        <Plus aria-hidden className="size-5" />
        List a tool
      </Link>
    </Button>
  );
}

export function MyListingsPage() {
  const { data, isLoading, error, retry } = useAppQuery(api.tools.myListings, {});
  const offline = useOffline();
  const today = clientToday();
  const [deleting, setDeleting] = useState<MyListingDTO | null>(null);

  // Deleted listings disappear from myListings, so drop the row optimistically.
  const remove = useMutation(api.tools.remove).withOptimisticUpdate((store, { toolId }) => {
    const rows = store.getQuery(api.tools.myListings, {});
    if (!rows) return;
    store.setQuery(api.tools.myListings, {}, rows.filter((r) => r._id !== toolId));
  });

  const confirmDelete = async (toolId: Id<"tools">) => {
    try {
      await remove({ toolId });
    } catch (err) {
      toastAppError(err);
      throw err;
    }
    toast.success(TOAST_COPY.listingDeleted);
  };

  let body;
  if (isLoading) {
    body = <ListingRowsSkeleton />;
  } else if (error || !data) {
    body = (
      <ErrorState
        title="Couldn't load your listings."
        description="Your tools are safe. Try again in a moment."
        onRetry={retry}
      />
    );
  } else if (!data.length) {
    body = (
      <EmptyState
        icon={PackagePlus}
        title="You haven't listed anything yet."
        description="That ladder in the garage could make someone's weekend."
        action={<ListToolButton className="h-11 pr-[18px] pl-3.5 md:h-11" />}
      />
    );
  } else {
    body = (
      <>
        <ListingTableHeader />
        <ul className="m-0 flex list-none flex-col gap-3 p-0 min-[900px]:gap-0 min-[900px]:rounded-lg min-[900px]:border min-[900px]:border-border min-[900px]:bg-card min-[900px]:shadow-ll-card">
          {data.map((l) => (
            <ListingRow key={l._id} listing={l} today={today} offline={offline} onDelete={() => setDeleting(l)} />
          ))}
        </ul>
      </>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="My listings"
        subtitle="Tools you lend to neighbors"
        // Mobile has the "+" in the top bar instead (brief B16).
        actions={<ListToolButton className="hidden pr-4 pl-3 md:inline-flex" />}
      />
      <div className="mt-7">{body}</div>
      {deleting ? (
        <DeleteListingDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          toolName={deleting.name}
          pendingCount={deleting.pendingCount}
          onConfirm={() => confirmDelete(deleting._id)}
        />
      ) : null}
    </PageContainer>
  );
}
