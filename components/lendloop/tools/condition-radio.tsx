"use client";

import { useImperativeHandle, useRef, type KeyboardEvent, type Ref } from "react";
import { CONDITIONS, CONDITION_META, type Condition } from "@/lib/domain/categories";
import { cn } from "@/lib/utils";

const ARROW_STEP: Record<string, number | undefined> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export type ConditionRadioProps = {
  labelId: string;
  value: Condition | null;
  onChange: (value: Condition) => void;
  /** Focus left the whole group: mark the field as touched. */
  onBlur: () => void;
  invalid: boolean;
  describedBy?: string;
  /** Lets the form move focus here (the checked option, or the first one). */
  ref?: Ref<{ focus: () => void }>;
};

/**
 * Segmented radio group: roving tabindex, arrow keys move and select
 * (WAI-ARIA radio pattern). Helper text for the selection is rendered by the form.
 */
export function ConditionRadio({ labelId, value, onChange, onBlur, invalid, describedBy, ref }: ConditionRadioProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = value ? CONDITIONS.indexOf(value) : -1;
  useImperativeHandle(ref, () => ({ focus: () => buttons.current[Math.max(current, 0)]?.focus() }), [current]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = ARROW_STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const next = ((current < 0 ? 0 : current + step) + CONDITIONS.length) % CONDITIONS.length;
    onChange(CONDITIONS[next]);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-required
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur();
      }}
      className={cn(
        "grid grid-cols-4 gap-1 rounded-tile border bg-muted p-1",
        invalid ? "border-destructive" : "border-transparent",
      )}
    >
      {CONDITIONS.map((c, i) => {
        const checked = value === c;
        return (
          <button
            key={c}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (current < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(c)}
            onKeyDown={onKeyDown}
            className={cn(
              "h-11 cursor-pointer truncate rounded-[7px] border px-1.5 text-sm whitespace-nowrap text-foreground transition-colors duration-150 md:h-9",
              checked ? "border-border bg-card font-semibold shadow-ll-card" : "border-transparent bg-transparent font-medium",
            )}
          >
            {CONDITION_META[c].label}
          </button>
        );
      })}
    </div>
  );
}
