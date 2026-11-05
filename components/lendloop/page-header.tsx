import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page width container: max-w-6xl (1152px), 16/24/32px gutters, 32px top / 64px bottom. */
export function PageContainer({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-6 lg:px-8", className)} {...props} />;
}

export type PageHeaderProps = {
  /** The page's only <h1>. */
  title: ReactNode;
  /** Muted 16px line under the title ("Things you've asked to borrow"). */
  subtitle?: ReactNode;
  /** Right-aligned actions (e.g. the desktop "List a tool" button). */
  actions?: ReactNode;
  className?: string;
};

/** H1 (Bricolage 24→30px) + subtitle + actions, bottom-aligned and wrapping. */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 font-display text-[clamp(24px,4vw,30px)] leading-[1.15] font-semibold tracking-[-0.01em] text-balance">
          {title}
        </h1>
        {subtitle ? <p className="m-0 text-base text-muted-foreground tabular">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
