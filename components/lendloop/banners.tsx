"use client";

import { useConvexConnectionState } from "convex/react";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { DEGRADED_NOTIFICATIONS } from "@/lib/copy";
import { cn } from "@/lib/utils";

/** Amber banner when notifications are delayed (brief B14 item 7). */
export function AutomationDegradedBanner({ className }: { className?: string }) {
  return (
    <Alert tone="warning" size="md" className={className}>
      {DEGRADED_NOTIFICATIONS}
    </Alert>
  );
}

/**
 * True once the Convex socket has dropped for more than `graceMs` after having
 * connected. Use it to disable mutations with OFFLINE_ACTION_REASON
 * ("You're offline. Reconnect to continue.").
 */
export function useOffline(graceMs = 1500): boolean {
  const { isWebSocketConnected, hasEverConnected } = useConvexConnectionState();
  const disconnected = hasEverConnected && !isWebSocketConnected;
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    // Short blips (tab wake, network handover) shouldn't flash the pill.
    const id = window.setTimeout(() => setOffline(disconnected), disconnected ? graceMs : 0);
    return () => window.clearTimeout(id);
  }, [disconnected, graceMs]);
  return offline;
}

/** Fixed top-center ink pill while the realtime connection is down (brief B14 item 5). */
export function OfflineBanner({ className }: { className?: string }) {
  const offline = useOffline();
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-3 md:top-[72px]">
      {offline ? (
        <span
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-full bg-foreground px-3.5 text-[13px] font-medium whitespace-nowrap text-background shadow-ll-pop animate-ll-in",
            className,
          )}
        >
          <LoaderCircle aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
          Reconnecting… changes will sync.
        </span>
      ) : null}
    </div>
  );
}
