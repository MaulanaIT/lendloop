import { cn } from "@/lib/utils";
import { Wordmark } from "./logo";

/** Footer: wordmark + "© 2026 LendLoop · a demo project". Hidden on mobile inside the app (tab bar instead). */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-border", className)}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-6 sm:px-6 lg:px-8">
        <Wordmark size="sm" />
        <p className="m-0 text-[13px] text-muted-foreground">© 2026 LendLoop · a demo project</p>
      </div>
    </footer>
  );
}
