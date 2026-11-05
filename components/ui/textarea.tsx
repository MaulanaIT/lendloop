import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { controlClasses } from "./input";

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(controlClasses, "min-h-[72px] resize-y py-2.5 leading-[1.5]", className)}
      {...props}
    />
  );
}
