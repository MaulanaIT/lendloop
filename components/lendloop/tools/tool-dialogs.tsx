"use client";

import { useMutation } from "convex/react";
import { Trash } from "lucide-react";
import { useEffect } from "react";
import { DeleteListingDialog, RemoveListingDialog } from "@/components/lendloop/dialogs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TOAST_COPY } from "@/lib/copy";
import { toast, toastAppError } from "@/lib/toast";
import { useAppQuery } from "@/lib/hooks/use-app-query";

export type ToolTarget = { _id: Id<"tools">; name: string };

/**
 * Owner delete confirm wired to tools.remove. Convex re-checks ownership and
 * blocks the delete while the tool is lent out or booked (HAS_ACTIVE_LOAN).
 */
export function DeleteToolDialog({
  tool,
  pendingCount,
  onOpenChange,
  onDeleted,
}: {
  /** The listing to delete; null keeps the dialog closed. */
  tool: ToolTarget | null;
  pendingCount: number;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const remove = useMutation(api.tools.remove);
  return (
    <DeleteListingDialog
      open={tool !== null}
      onOpenChange={onOpenChange}
      toolName={tool?.name ?? ""}
      pendingCount={pendingCount}
      onConfirm={async () => {
        if (!tool) return;
        try {
          await remove({ toolId: tool._id });
        } catch (err) {
          toastAppError(err);
          throw err;
        }
        toast.message(TOAST_COPY.listingDeleted, {
          description: `${tool.name} is no longer on the board.`,
          icon: Trash,
        });
        onDeleted?.();
      }}
    />
  );
}

/**
 * Admin removal wired to admin.removeListing. The impact summary comes from
 * admin.listings, which is only queried while the dialog is open; Convex
 * rejects both calls for non-admins regardless of what the UI shows.
 */
export function RemoveToolDialog({
  tool,
  onOpenChange,
  onRemoved,
}: {
  tool: ToolTarget | null;
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
}) {
  const removeListing = useMutation(api.admin.removeListing);
  const { data, error } = useAppQuery(api.admin.listings, tool ? {} : "skip");
  const listing = tool ? data?.find((l) => l._id === tool._id) : undefined;

  useEffect(() => {
    if (!tool || !error) return;
    toast.error(error.copy);
    onOpenChange(false);
  }, [tool, error, onOpenChange]);

  // Wait for the impact summary rather than showing wrong numbers.
  if (!tool || !listing) return null;

  return (
    <RemoveListingDialog
      key={tool._id}
      open
      onOpenChange={onOpenChange}
      listing={listing}
      onConfirm={async ({ reason, detail }) => {
        try {
          await removeListing({ toolId: tool._id, reason, detail: detail ?? undefined });
        } catch (err) {
          toastAppError(err);
          throw err;
        }
        toast.message(TOAST_COPY.listingRemoved, { icon: Trash });
        onRemoved?.();
      }}
    />
  );
}
