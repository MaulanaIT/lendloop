"use client";

import { PackagePlus, X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Tooltip } from "@/components/ui/tooltip";

const STORAGE_KEY = "lendloop:first-run-banner-dismissed";
const EVENT = "lendloop:first-run-banner";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // storage blocked: just show the banner
  }
}

/** Per-browser dismissal. The server snapshot says "dismissed" so it never flashes in. */
function useDismissed(): [boolean, () => void] {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore: it simply comes back next visit.
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [dismissed, dismiss];
}

/** Info banner on Browse for neighbors who haven't listed anything yet (brief B3, optional). */
export function FirstRunBanner() {
  const [dismissed, dismiss] = useDismissed();
  if (dismissed) return null;
  return (
    <div
      role="note"
      className="mt-5 flex items-center gap-3 rounded-lg border border-info-border bg-info-bg py-3 pr-3 pl-4 text-info"
    >
      <PackagePlus aria-hidden className="size-5 shrink-0" />
      <p className="m-0 min-w-0 flex-1">
        Got something to share?{" "}
        <Link
          href="/tools/new"
          className="font-semibold text-info underline underline-offset-[3px] hover:text-info"
        >
          List your first tool
        </Link>
      </p>
      <Tooltip content="Dismiss">
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-info transition-colors hover:bg-card md:size-9"
        >
          <X aria-hidden className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}
