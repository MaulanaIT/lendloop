import { ArrowRight, Check, CircleCheck, CircleX, TriangleExclamationPoint } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtAbsolute, fmtWhen, plural } from "@/lib/copy";
import { ERROR_CATEGORY_LABEL } from "@/lib/domain/automation";
import { isoDateTime } from "@/lib/domain/dates";
import type { AutomationHealthDTO } from "@/lib/domain/dto";
import { cn } from "@/lib/utils";
import { fmtDuration } from "./admin-copy";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function SummaryCard({
  title,
  icon,
  danger = false,
  className,
  children,
}: {
  title: string;
  icon?: ReactNode;
  danger?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 flex-col rounded-lg border bg-card px-[18px] py-4 shadow-ll-card",
        danger ? "border-danger-border" : "border-border",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="m-0 text-[13px] font-semibold text-muted-foreground">
          {title}
        </h2>
        {icon}
      </div>
      {children}
    </section>
  );
}

/** Success strip shown when nothing failed or is retrying in the last 24h. */
export function AutomationHealthyBanner({ lastRunAt, nowMs }: { lastRunAt: number | null; nowMs: number }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-success-border bg-success-bg px-[18px] py-4 text-success"
    >
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-card">
        <CircleCheck className="size-5" />
      </span>
      <p className="m-0 text-[15px] font-semibold">
        {lastRunAt ? `All automations healthy · last run ${fmtWhen(lastRunAt, nowMs)}` : "All automations healthy"}
      </p>
    </div>
  );
}

export type AutomationSummaryCardsProps = {
  data: Pick<AutomationHealthDTO, "lastRun" | "notifications24h" | "failed24h">;
  nowMs: number;
  /** "Review failures": switch to Deliveries filtered to Failed. */
  onReviewFailures: () => void;
};

/** The three summary cards: daily reminder run, notifications (24h), failed (24h). */
export function AutomationSummaryCards({ data, nowMs, onReviewFailures }: AutomationSummaryCardsProps) {
  const run = data.lastRun;
  const n = data.notifications24h;
  const failed = data.failed24h;
  const legend = [
    { label: "delivered", count: n.delivered, color: "bg-success" },
    { label: "retrying", count: n.retrying, color: "bg-warning" },
    { label: "failed", count: n.failed, color: "bg-destructive" },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
      <SummaryCard
        title="Daily reminder run"
        className="gap-2"
        icon={
          run && run.failed > 0 ? (
            <span role="img" aria-label="The last run had a failure" className="inline-flex text-warning">
              <TriangleExclamationPoint aria-hidden className="size-4" />
            </span>
          ) : null
        }
      >
        {run ? (
          <>
            <p className="m-0 text-base font-semibold tabular">
              <time dateTime={isoDateTime(run.finishedAt)} title={fmtAbsolute(run.finishedAt)}>
                {capitalize(fmtWhen(run.finishedAt, nowMs))}
              </time>
              {" · "}
              <span className="font-mono text-sm font-medium">{run.executionId}</span>
            </p>
            <p className="m-0 text-[13px] text-pretty text-muted-foreground tabular">
              {`${run.found} found · ${run.sent} sent · `}
              <span className={run.failed ? "font-semibold text-danger" : undefined}>{`${run.failed} failed`}</span>
              {` · ${run.duplicates} ${plural(run.duplicates, "duplicate")} ignored`}
              {run.skipped ? ` · ${run.skipped} skipped` : ""}
              {` · ${fmtDuration(run.durationMs)}`}
            </p>
          </>
        ) : (
          <p className="m-0 text-muted-foreground">No runs yet. The first one runs at 09:00.</p>
        )}
      </SummaryCard>

      <SummaryCard title="Notifications (24h)" className="gap-2.5">
        <p className="m-0 text-base font-semibold tabular">
          {`${n.delivered} of ${n.total} delivered · ${n.retrying} retrying · ${n.failed} failed`}
        </p>
        {/* Decorative: the numbers are in the line above and the legend below. */}
        <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
          {legend.map((s) =>
            s.count > 0 ? <span key={s.label} className={s.color} style={{ flex: `${s.count} 1 0` }} /> : null,
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular">
          {legend.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-[5px]">
              <span aria-hidden className={cn("size-2 rounded-[2px]", s.color)} />
              {`${s.count} ${s.label}`}
            </span>
          ))}
        </div>
      </SummaryCard>

      <SummaryCard title="Failed (24h)" danger={failed > 0} className="gap-1.5">
        <p
          className={cn(
            "m-0 font-display text-[44px] leading-none font-bold tabular",
            failed > 0 ? "text-danger" : "text-muted-foreground",
          )}
        >
          {failed}
        </p>
        {failed > 0 ? (
          <Button
            variant="link"
            onClick={onReviewFailures}
            className="min-h-11 gap-1 self-start text-danger hover:text-danger md:min-h-10"
          >
            Review failures
            <ArrowRight aria-hidden className="size-4" />
          </Button>
        ) : null}
      </SummaryCard>
    </div>
  );
}

function SideCard({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-[18px] text-foreground shadow-ll-card",
        className,
      )}
    >
      <h2 id={id} className="m-0 text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Which environment variables are set. Presence only: Convex never sends the
 * values, and this card never asks for them.
 */
export function ConfigPresenceCard({ config }: { config: AutomationHealthDTO["config"] }) {
  return (
    <SideCard title="Configuration">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {config.map((c) =>
          c.configured ? (
            <li key={c.key} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs [overflow-wrap:anywhere]">{c.key}</span>
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-success">
                <Check aria-hidden className="size-3.5" />
                configured
              </span>
            </li>
          ) : (
            <li
              key={c.key}
              className="flex flex-col gap-1 rounded-md border border-danger-border bg-danger-bg px-3 py-2.5 text-danger"
            >
              <span className="flex items-center gap-1.5">
                <CircleX aria-hidden className="size-3.5 shrink-0" />
                <span className="font-mono text-xs font-medium [overflow-wrap:anywhere]">{c.key}</span>
              </span>
              <span className="text-[13px] font-medium text-pretty">
                Not set — add it in Convex dashboard → Environment variables
              </span>
            </li>
          ),
        )}
      </ul>
      <p className="m-0 text-[13px] text-pretty text-muted-foreground">
        Inbound requests require a valid HMAC signature (rejected requests are logged in Convex logs).
      </p>
    </SideCard>
  );
}

export function HowFailuresSurfaceCard() {
  return (
    <SideCard title="How failures surface">
      <ul className="m-0 flex flex-col gap-1.5 pl-[18px] text-pretty">
        <li>n8n retries 3× with backoff</li>
        <li>Error workflow writes the failure back here</li>
        <li>Admin nav badge + banner while there are failures in the last 24h without a successful retry</li>
      </ul>
    </SideCard>
  );
}

/** Failures reported by the n8n error workflow (last 7 days). Category + IDs only, no stack traces. */
export function WorkflowErrorsCard({
  errors,
  nowMs,
}: {
  errors: AutomationHealthDTO["workflowErrors"];
  nowMs: number;
}) {
  return (
    <SideCard title="Workflow errors (7 days)">
      <ul className="m-0 flex list-none flex-col p-0">
        {errors.map((e, i) => (
          <li key={e._id} className={cn("flex flex-col gap-0.5 py-2 text-[13px]", i > 0 && "border-t border-border")}>
            <span className="flex flex-wrap items-center justify-between gap-x-2">
              <span className="font-medium">{e.workflow}</span>
              <time dateTime={isoDateTime(e.at)} title={fmtAbsolute(e.at)} className="text-muted-foreground tabular">
                {fmtWhen(e.at, nowMs)}
              </time>
            </span>
            <span className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
              <span className="font-semibold text-danger">{ERROR_CATEGORY_LABEL[e.errorCategory]}</span>
              {e.node ? <span>{`at ${e.node}`}</span> : null}
              <span className="font-mono text-xs text-foreground">{e.executionId}</span>
            </span>
          </li>
        ))}
      </ul>
    </SideCard>
  );
}

/** Loading shape: three summary cards and a table. */
export function AutomationSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading automation" className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-[132px] flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-5 w-[70%]" />
            <Skeleton className="h-3 w-[85%]" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="h-10 bg-muted" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex h-[52px] items-center gap-4 border-t border-border px-3">
            <Skeleton className="h-3 w-[70px]" />
            <Skeleton className="h-3 w-1/5" />
            <Skeleton className="h-5 w-[90px] rounded-full" />
            <Skeleton className="ml-auto h-3 w-[22%]" />
          </div>
        ))}
      </div>
    </div>
  );
}
