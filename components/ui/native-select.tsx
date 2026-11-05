import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { controlClasses } from "./input";

export type NativeSelectProps = ComponentProps<"select"> & {
  /** Filter look when a non-default value is chosen: primary border + primary-subtle fill. */
  active?: boolean;
  /** Muted text while the empty placeholder option is selected. */
  placeholderShown?: boolean;
  wrapperClassName?: string;
};

/**
 * A real <select> (best mobile UX and accessibility) styled like the prototype,
 * with the chevron overlaid. Use <option value="" disabled>Choose a reason</option>
 * plus `placeholderShown` for a placeholder.
 */
export function NativeSelect({
  className,
  wrapperClassName,
  active = false,
  placeholderShown = false,
  children,
  ...props
}: NativeSelectProps) {
  return (
    <span className={cn("relative inline-flex min-w-0", wrapperClassName)}>
      <select
        data-slot="native-select"
        className={cn(
          controlClasses,
          "h-11 cursor-pointer appearance-none pr-9 md:h-10",
          active && "border-primary bg-primary-subtle",
          placeholderShown && "text-muted-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}
