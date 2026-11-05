"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CopyButtonProps = {
  value: string;
  /** What is copied, lowercase: "execution ID" → aria-label "Copy execution ID". */
  what: string;
  className?: string;
};

/** Icon button that copies `value`; shows a green Check and "Copied" for 1.5s. 44px on mobile, 28px on desktop. */
export function CopyButton({ value, what, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); the value stays visible to select.
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  const label = copied ? "Copied" : `Copy ${what}`;
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onCopy}
        aria-label={label}
        className={cn(
          "grid size-11 shrink-0 cursor-pointer place-items-center rounded-sm transition-colors hover:bg-border md:size-7",
          copied ? "text-success" : "text-muted-foreground",
          className,
        )}
      >
        {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
      </button>
    </Tooltip>
  );
}
