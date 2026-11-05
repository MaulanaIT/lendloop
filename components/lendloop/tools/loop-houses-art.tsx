import { cn } from "@/lib/utils";

const HOUSE = "M-18 4 L0 -14 L18 4 V20 H-18 Z";
const DOOR = "M-5 20 V10 H5 V20";

/**
 * Hero drawing: one continuous teal loop connecting four house outlines
 * (1.5px stroke, no category colors). Houses are filled with the page
 * background so the loop passes behind them.
 */
export function LoopHousesArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      role="img"
      aria-label="Line drawing of one loop connecting four houses"
      className={cn("h-auto w-full overflow-visible text-primary", className)}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M90 90 C150 40 240 30 300 70 C370 115 360 190 320 220 C270 260 160 270 100 230 C40 190 40 125 90 90 Z"
        />
        <g transform="translate(90 90) scale(1.5)">
          <path vectorEffect="non-scaling-stroke" d={HOUSE} fill="var(--background)" />
          <path vectorEffect="non-scaling-stroke" d={DOOR} />
        </g>
        <g transform="translate(300 70) scale(1.5)">
          <path vectorEffect="non-scaling-stroke" d={HOUSE} fill="var(--background)" />
          <path vectorEffect="non-scaling-stroke" d={DOOR} />
          <path vectorEffect="non-scaling-stroke" d="M9 -5 V-14 H14 V0" />
        </g>
        <g transform="translate(320 220) scale(1.5)">
          <path vectorEffect="non-scaling-stroke" d={HOUSE} fill="var(--background)" />
          <path vectorEffect="non-scaling-stroke" d={DOOR} />
        </g>
        <g transform="translate(100 230) scale(1.5)">
          <path vectorEffect="non-scaling-stroke" d={HOUSE} fill="var(--background)" />
          <path vectorEffect="non-scaling-stroke" d={DOOR} />
          <path vectorEffect="non-scaling-stroke" d="M-13 9 H-8 V14 H-13 Z" />
        </g>
      </g>
    </svg>
  );
}
