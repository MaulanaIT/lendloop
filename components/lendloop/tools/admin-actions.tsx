"use client";

import { ShieldHalf, Trash } from "lucide-react";
import { useState } from "react";
import { useOffline } from "@/components/lendloop/banners";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OFFLINE_ACTION_REASON } from "@/lib/copy";
import type { ToolDetailDTO } from "@/lib/domain/dto";
import { RemoveToolDialog } from "./tool-dialogs";

/**
 * (d) Admin looking at someone else's tool. Admins can't edit or approve on
 * others' listings, so only Remove is offered; admin.removeListing re-checks
 * the role in Convex.
 */
export function AdminActions({ tool, onRemoved }: { tool: ToolDetailDTO; onRemoved: () => void }) {
  const [open, setOpen] = useState(false);
  const offline = useOffline();
  return (
    <section
      aria-labelledby="adm-h"
      className="flex flex-col gap-2.5 rounded-lg border border-border bg-card px-5 py-4"
    >
      <h2 id="adm-h" className="m-0 flex items-center gap-2 text-[15px] font-semibold">
        <Badge tone="admin" size="sm" weight="semibold">
          <ShieldHalf aria-hidden className="size-3.5" />
          Admin
        </Badge>
        Admin actions
      </h2>
      <p className="m-0 text-[13px] text-muted-foreground text-pretty">
        Removing hides it from Browse. Only the owner, {tool.owner.name}, can edit it or act on its loans
      </p>
      <Button
        variant="destructive-outline"
        className="self-start [&_svg]:size-5"
        disabledReason={offline ? OFFLINE_ACTION_REASON : null}
        onClick={() => setOpen(true)}
      >
        <Trash aria-hidden />
        Remove listing
      </Button>
      <RemoveToolDialog
        tool={open ? { _id: tool._id, name: tool.name } : null}
        onOpenChange={setOpen}
        onRemoved={onRemoved}
      />
    </section>
  );
}
