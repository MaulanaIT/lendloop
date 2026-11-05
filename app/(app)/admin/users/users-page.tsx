"use client";

import { useMutation } from "convex/react";
import { BadgeCheck, Users } from "lucide-react";
import { useState } from "react";
import { useAdminForbidden } from "@/components/lendloop/admin/admin-gate";
import { AdminTable, AdminTableSkeleton, type AdminColumn } from "@/components/lendloop/admin/admin-table";
import { TrustSwitch, trustedSubline } from "@/components/lendloop/admin/trust-switch";
import { useOffline } from "@/components/lendloop/banners";
import { EmptyState } from "@/components/lendloop/empty-state";
import { ErrorState } from "@/components/lendloop/error-state";
import { PersonAvatar } from "@/components/lendloop/person";
import { RoleBadge } from "@/components/lendloop/role-badge";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { OFFLINE_ACTION_REASON, TOAST_COPY } from "@/lib/copy";
import type { AdminUserDTO } from "@/lib/domain/dto";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { useViewer } from "@/lib/hooks/use-viewer";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Admin · Users (brief B12). Roles are read-only here on purpose: there is no
 * "make admin" control (privilege escalation); roles change only via the
 * server-side users:setRole CLI. Admins manage the Trusted Lender badge.
 */
export function AdminUsersPage() {
  const { viewer } = useViewer();
  const { data, isLoading, error, retry } = useAppQuery(api.admin.users, {});
  useAdminForbidden(error);
  const offline = useOffline();
  const [busy, setBusy] = useState<ReadonlySet<Id<"users">>>(new Set());

  // Optimistic: flip the badge in the cached admin.users result right away.
  // Convex drops this local change automatically if the mutation throws.
  const setTrusted = useMutation(api.admin.setTrusted).withOptimisticUpdate((store, { userId, trusted }) => {
    const current = store.getQuery(api.admin.users, {});
    if (!current) return;
    store.setQuery(
      api.admin.users,
      {},
      current.map((u) =>
        u._id === userId
          ? {
              ...u,
              trusted,
              trustedGrantedByName: trusted ? (viewer?.name ?? null) : null,
              trustedGrantedAt: trusted ? Date.now() : null,
            }
          : u,
      ),
    );
  });

  async function commit(user: Pick<AdminUserDTO, "_id" | "name">, next: boolean) {
    setBusy((s) => new Set(s).add(user._id));
    try {
      // Convex checks the admin role and refuses self-changes; the UI only hides/blocks them.
      await setTrusted({ userId: user._id, trusted: next });
      toast.success(next ? TOAST_COPY.trustedGranted(user.name) : TOAST_COPY.trustedRevoked(user.name), {
        icon: BadgeCheck,
      });
    } catch {
      toast.error("Couldn't update the badge. Try again.", {
        onRetry: () => void commit(user, next),
      });
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(user._id);
        return n;
      });
    }
  }

  const all = data ?? [];
  const switchFor = (u: AdminUserDTO, variant: "row" | "card") => (
    <TrustSwitch
      user={u}
      variant={variant}
      busy={busy.has(u._id)}
      disabledReason={offline ? OFFLINE_ACTION_REASON : null}
      onConfirm={(next) => void commit(u, next)}
    />
  );

  const columns: AdminColumn<AdminUserDTO>[] = [
    {
      key: "user",
      header: "User",
      cell: (u) => (
        <span className="flex items-center gap-2.5">
          <PersonAvatar initials={u.initials} bordered className="size-8 text-xs" />
          <span className="font-medium">{u.name}</span>
          {u.isSelf ? <span className="text-muted-foreground">(you)</span> : null}
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      className: "w-[100px]",
      cell: (u) => <RoleBadge role={u.role} />,
    },
    {
      key: "listings",
      header: "Listings",
      align: "right",
      className: "w-[90px]",
      cell: (u) => u.listings,
    },
    {
      key: "lent",
      header: "Loans completed as lender",
      align: "right",
      className: "w-[150px]",
      cell: (u) => u.loansCompleted,
    },
    {
      key: "overdue",
      header: "Overdue now",
      align: "right",
      className: "w-[110px]",
      cellClassName: (u) => overdueClass(u),
      cell: (u) => u.overdueNow,
    },
    {
      key: "trusted",
      header: "Trusted Lender",
      className: "w-[260px] pl-6",
      cellClassName: "pl-6",
      cell: (u) => (
        <div className="flex items-center gap-3">
          {switchFor(u, "row")}
          <span className={cn("text-[13px]", u.trusted ? "text-foreground" : "text-muted-foreground")}>
            {trustedSubline(u)}
          </span>
        </div>
      ),
    },
  ];

  let body;
  if (isLoading) {
    body = (
      <AdminTableSkeleton
        label="Loading users"
        rowHeight={56}
        cells={["size-8 rounded-full", "h-3 w-[18%]", "h-5 w-14 rounded-full", "ml-auto h-5 w-9 rounded-full"]}
      />
    );
  } else if (error) {
    body = <ErrorState title="Couldn't load users." description="Try again in a moment." onRetry={retry} />;
  } else if (all.length === 0) {
    body = <EmptyState icon={Users} title="No users yet." />;
  } else {
    body = (
      <AdminTable
        label="Users"
        rows={all}
        columns={columns}
        rowKey={(u) => u._id}
        rowHeight={56}
        renderCard={(u) => (
          <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5 shadow-ll-card">
            <div className="flex flex-wrap items-center gap-2.5">
              <PersonAvatar initials={u.initials} size="md" bordered />
              <span className="font-semibold">{u.name}</span>
              {u.isSelf ? <span className="text-muted-foreground">(you)</span> : null}
              <RoleBadge role={u.role} />
            </div>
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground tabular">
              <span>
                <span className="font-semibold text-foreground">{u.listings}</span> listings
              </span>
              <span>
                <span className="font-semibold text-foreground">{u.loansCompleted}</span> completed as lender
              </span>
              <span className={u.overdueNow > 0 ? "text-danger" : undefined}>
                <span className="font-semibold">{u.overdueNow}</span> overdue now
              </span>
            </p>
            <div className="flex items-center gap-3 border-t border-border pt-2.5">
              {switchFor(u, "card")}
              <span className="flex flex-col">
                <span className="font-medium">Trusted Lender</span>
                <span className={cn("text-[13px]", u.trusted ? "text-foreground" : "text-muted-foreground")}>
                  {trustedSubline(u)}
                </span>
              </span>
            </div>
          </div>
        )}
      />
    );
  }

  return <div className="mt-6">{body}</div>;
}

function overdueClass(u: AdminUserDTO) {
  return u.overdueNow > 0 ? "font-semibold text-danger" : "text-muted-foreground";
}
