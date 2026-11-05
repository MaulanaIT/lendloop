"use client";

import { CircleCheck, Repeat, TriangleExclamationPoint, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RadioGroup } from "radix-ui";
import { Suspense, useMemo, useState } from "react";
import { adminAutomationText } from "@/components/lendloop/admin/admin-copy";
import {
  CategorySelect,
  FiltersButton,
  FiltersSheet,
  NoMatches,
  ResultCount,
  SheetField,
  type CategoryFilterValue,
} from "@/components/lendloop/admin/admin-filters";
import { useAdminForbidden } from "@/components/lendloop/admin/admin-gate";
import {
  AdminTable,
  AdminTableSkeleton,
  StackedFields,
  stackedCardClasses,
  type AdminColumn,
} from "@/components/lendloop/admin/admin-table";
import { CategoryTile } from "@/components/lendloop/category-icon";
import { EmptyState } from "@/components/lendloop/empty-state";
import { ErrorState } from "@/components/lendloop/error-state";
import { DateRange } from "@/components/lendloop/relative-time";
import { StatusBadge } from "@/components/lendloop/status-badge";
import { useNow } from "@/components/lendloop/use-now";
import { SearchInput } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { loanBadgeLabel } from "@/lib/copy";
import { clientToday } from "@/lib/config";
import { CATEGORY_META, categoryFromSlug } from "@/lib/domain/categories";
import type { LoanRowDTO } from "@/lib/domain/dto";
import type { LoanStatus } from "@/lib/domain/status";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { useUrlFilters, useUrlText } from "@/lib/hooks/use-url-filters";
import { cn } from "@/lib/utils";

type StatusFilter = LoanStatus | "all";

const SEGMENTS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "upcoming", label: "Approved" },
  { key: "on_loan", label: "On loan" },
  { key: "overdue", label: "Overdue" },
  { key: "returned", label: "Returned" },
  { key: "declined", label: "Declined" },
  { key: "cancelled", label: "Cancelled" },
];

function matchesQuery(l: LoanRowDTO, q: string) {
  if (!q) return true;
  return `${l.ref} ${l.tool.name} ${l.owner.name} ${l.borrower.name}`.toLowerCase().includes(q);
}

/** Admin · Loans (brief B11): read-only overview. Approve/return stay with the owner. */
export function AdminLoansPage() {
  // The filters live in the URL (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense>
      <AdminLoans />
    </Suspense>
  );
}

function AdminLoans() {
  const router = useRouter();
  const { data, isLoading, error, retry } = useAppQuery(api.admin.loans, {});
  useAdminForbidden(error);

  // Kept in the URL so opening a loan and coming back keeps the filtered view.
  const url = useUrlFilters({ status: "all", category: "all", q: "" });
  const statusParam = url.get("status");
  const status: StatusFilter = SEGMENTS.some((s) => s.key === statusParam) ? (statusParam as StatusFilter) : "all";
  const category: CategoryFilterValue = categoryFromSlug(url.get("category")) ?? "all";
  const search = useUrlText(url.get("q"), (q) => url.set({ q }));
  const query = search.text;
  const setStatus = (v: StatusFilter) => url.set({ status: v });
  const setCategory = (v: CategoryFilterValue) => url.set({ category: v === "all" ? "all" : CATEGORY_META[v].slug });
  const [sheetOpen, setSheetOpen] = useState(false);
  const now = useNow();
  const today = clientToday();

  const all = useMemo(() => data ?? [], [data]);
  const q = query.trim().toLowerCase();
  // Category + search narrow the segment counts; the status segment then picks within them.
  const base = useMemo(
    () => all.filter((l) => (category === "all" || l.tool.category === category) && matchesQuery(l, q)),
    [all, category, q],
  );
  const counts = useMemo(() => {
    const c: Partial<Record<StatusFilter, number>> = { all: base.length };
    for (const l of base) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [base]);
  // Server order is already "overdue first, then end date".
  const rows = status === "all" ? base : base.filter((l) => l.status === status);

  const clear = () => {
    search.reset("");
    url.set({ status: "all", category: "all", q: "" });
  };

  const columns: AdminColumn<LoanRowDTO>[] = [
    {
      key: "ref",
      header: "Loan",
      className: "w-[76px]",
      cell: (l) => (
        <Link
          href={`/loans/${l.ref}`}
          className="font-mono text-[13px] text-foreground no-underline hover:text-primary"
        >
          {l.ref}
        </Link>
      ),
    },
    {
      key: "tool",
      header: "Tool",
      cell: (l) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <CategoryTile category={l.tool.category} size={32} className="size-7 rounded-sm" />
          <span className="font-medium">{l.tool.name}</span>
        </span>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      className: "w-24",
      cell: (l) => l.owner.name,
    },
    {
      key: "borrower",
      header: "Borrower",
      className: "w-24",
      cell: (l) => l.borrower.name,
    },
    {
      key: "dates",
      header: "Dates",
      className: "w-[118px]",
      cellClassName: "whitespace-nowrap",
      cell: (l) => <DateRange start={l.startDate} end={l.endDate} />,
    },
    {
      key: "status",
      header: "Status",
      className: "w-[150px]",
      cell: (l) => <LoanBadge loan={l} today={today} />,
    },
    {
      key: "reminders",
      header: "Reminders",
      align: "right",
      className: "w-[84px]",
      cellClassName: (l) => remindersClass(l),
      cell: (l) => l.remindersSent,
    },
    {
      key: "auto",
      header: "Last automation event",
      className: "w-[220px]",
      cellClassName: "text-[13px]",
      cell: (l) => <LastAutomation loan={l} nowMs={now} />,
    },
  ];

  let body;
  if (isLoading) {
    body = (
      <AdminTableSkeleton
        label="Loading loans"
        rowHeight={48}
        cells={["h-3 w-14", "h-3 w-[24%]", "h-3 w-[12%]", "h-5 w-[110px] rounded-full", "ml-auto h-3 w-[18%]"]}
      />
    );
  } else if (error) {
    body = <ErrorState title="Couldn't load loans." description="Try again in a moment." onRetry={retry} />;
  } else if (all.length === 0) {
    body = <EmptyState icon={Repeat} title="No loans yet." />;
  } else if (rows.length === 0 && status === "overdue") {
    body = <EmptyState icon={CircleCheck} title="Everything’s back where it belongs." />;
  } else if (rows.length === 0) {
    body = <NoMatches title="No loans match these filters." onClear={clear} />;
  } else {
    body = (
      <AdminTable
        label="Loans"
        rows={rows}
        columns={columns}
        rowKey={(l) => l._id}
        breakpoint={1100}
        rowHeight={48}
        onRowClick={(l) => router.push(`/loans/${l.ref}`)}
        renderCard={(l) => <LoanCard loan={l} today={today} nowMs={now} />}
      />
    );
  }

  const ready = !isLoading && !error && all.length > 0;

  return (
    <>
      <div className="mt-6 flex flex-col gap-3">
        <RadioGroup.Root
          aria-label="Status"
          value={status}
          onValueChange={(v) => setStatus(v as StatusFilter)}
          orientation="horizontal"
          className="-m-0.5 flex gap-1.5 overflow-x-auto p-0.5 [scrollbar-width:none] md:flex-wrap [&::-webkit-scrollbar]:hidden"
        >
          {SEGMENTS.map((s) => {
            const n = counts[s.key] ?? 0;
            return (
              <RadioGroup.Item
                key={s.key}
                value={s.key}
                className={cn(
                  "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-control-border bg-card px-3 text-sm font-medium whitespace-nowrap text-foreground tabular md:h-9",
                  "transition-colors duration-150 hover:bg-muted data-[state=checked]:border-primary data-[state=checked]:bg-primary-subtle",
                  // Inset ring: the scrolling segment row clips anything drawn outside.
                  "focus-visible:outline-offset-[-2px]",
                )}
              >
                {s.label}
                <span
                  className={cn(
                    "font-semibold",
                    s.key === "overdue" && n > 0 ? "text-danger" : "text-muted-foreground",
                  )}
                >
                  {ready ? n : "–"}
                </span>
              </RadioGroup.Item>
            );
          })}
        </RadioGroup.Root>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SearchInput
            aria-label="Search loans by tool or person"
            placeholder="Search tool or person"
            value={query}
            onChange={(e) => search.change(e.target.value)}
            wrapperClassName="flex-[1_1_240px] md:max-w-[320px]"
          />
          <CategorySelect
            aria-label="Category"
            value={category}
            onChange={setCategory}
            wrapperClassName="hidden md:inline-flex"
            className="font-medium"
          />
          <FiltersButton count={category !== "all" ? 1 : 0} onClick={() => setSheetOpen(true)} />
          {ready ? <ResultCount shown={rows.length} total={all.length} /> : null}
        </div>
      </div>

      <div className="mt-4">{body}</div>

      <FiltersSheet open={sheetOpen} onOpenChange={setSheetOpen} shown={rows.length} total={all.length} onClear={clear}>
        <SheetField label="Category">
          <CategorySelect value={category} onChange={setCategory} wrapperClassName="flex" className="text-base" />
        </SheetField>
      </FiltersSheet>
    </>
  );
}

function badgeLabel(l: LoanRowDTO, today: string) {
  // Admin tables keep returned loans short ("Returned"); the date is in the Dates column.
  return l.status === "returned" ? "Returned" : loanBadgeLabel(l, today);
}

function LoanBadge({ loan, today }: { loan: LoanRowDTO; today: string }) {
  return <StatusBadge status={loan.status} label={badgeLabel(loan, today)} size="sm" />;
}

function remindersClass(l: LoanRowDTO) {
  if (!l.remindersSent) return "text-muted-foreground";
  return cn("font-semibold", l.status === "overdue" ? "text-danger" : "text-foreground");
}

function LastAutomation({ loan, nowMs }: { loan: LoanRowDTO; nowMs: number }) {
  if (!loan.lastAutomation) return <span className="text-muted-foreground">—</span>;
  const { text, tone } = adminAutomationText(loan.lastAutomation, nowMs);
  const Icon = tone === "muted" ? Zap : TriangleExclamationPoint;
  return (
    <span
      className={cn(
        "flex items-start gap-1.5",
        tone === "danger" ? "font-semibold text-danger" : tone === "warning" ? "text-warning" : "text-muted-foreground",
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{text}</span>
    </span>
  );
}

function LoanCard({ loan: l, today, nowMs }: { loan: LoanRowDTO; today: string; nowMs: number }) {
  return (
    <Link
      href={`/loans/${l.ref}`}
      className={cn(stackedCardClasses, "no-underline", l.status === "overdue" && "border-danger-border")}
    >
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{l.ref}</span>
        <LoanBadge loan={l} today={today} />
      </span>
      <span className="flex items-center gap-2.5">
        <CategoryTile category={l.tool.category} size={32} className="size-9 rounded-md [&_svg]:size-[18px]" />
        <span className="font-semibold">{l.tool.name}</span>
      </span>
      <StackedFields
        items={[
          { label: "Owner", value: l.owner.name },
          { label: "Borrower", value: l.borrower.name },
          {
            label: "Dates",
            value: <DateRange start={l.startDate} end={l.endDate} />,
          },
          {
            label: "Reminders",
            value: l.remindersSent,
            className: remindersClass(l),
          },
          {
            label: "Last event",
            value: <LastAutomation loan={l} nowMs={nowMs} />,
          },
        ]}
      />
    </Link>
  );
}
