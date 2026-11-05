import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Shared control look: 44px on mobile, 40px on desktop, control-border, red when aria-invalid. */
export const controlClasses = cn(
  "w-full min-w-0 rounded-md border border-control-border bg-card px-3 text-[15px] text-foreground md:text-sm",
  "placeholder:text-muted-foreground transition-colors duration-150",
  "disabled:cursor-not-allowed disabled:opacity-55",
  "aria-invalid:border-destructive",
);

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input data-slot="input" type={type} className={cn(controlClasses, "h-11 md:h-10", className)} {...props} />;
}

/** Search field with the leading magnifier, as in Browse and the admin tables. */
export function SearchInput({
  className,
  wrapperClassName,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { wrapperClassName?: string }) {
  return (
    <label className={cn("relative block min-w-0 flex-1", wrapperClassName)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        data-slot="input"
        type="search"
        className={cn(controlClasses, "h-11 pl-[38px] md:h-10", className)}
        {...props}
      />
    </label>
  );
}
