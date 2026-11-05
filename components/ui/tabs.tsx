"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Radix tabs: arrow keys move between tabs, Home/End jump, roving tabindex. */
export const Tabs = TabsPrimitive.Root;

/** Underlined tab row (My requests, Incoming). Scrolls sideways on narrow screens. */
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export type TabsTriggerProps = ComponentProps<typeof TabsPrimitive.Trigger> & {
  /** Rendered as "Label (n)", tabular. Omit while loading/empty to show the bare label. */
  count?: number;
  /** "danger" for an Overdue tab with items: red text and a red underline when active. */
  tone?: "default" | "danger";
};

export function TabsTrigger({ className, count, tone = "default", children, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 border-0 border-b-2 border-transparent bg-transparent px-3.5",
        "text-sm font-semibold whitespace-nowrap tabular transition-colors duration-150",
        tone === "danger"
          ? "text-danger data-[state=active]:border-destructive"
          : "text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground",
        // Inset ring: the scrolling list clips anything drawn outside the trigger.
        "focus-visible:rounded-sm focus-visible:outline-offset-[-2px]",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? ` (${count})` : null}
    </TabsPrimitive.Trigger>
  );
}

/** Focusable panel (prototype: tabindex 0, 20px top margin). */
export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("mt-5 rounded-md", className)} {...props} />;
}
