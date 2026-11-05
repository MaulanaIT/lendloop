"use client";

import { OctagonExclamationPoint, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SystemState } from "@/components/lendloop/system-page";

/** Short reference for errors thrown in client components (they carry no digest). */
function shortRef(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `err_${Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("")}`;
}

/**
 * Route error boundary: "Something went wrong." [Try again] + a reference.
 * Only the server digest (or a random ref) is shown, never the message or
 * stack, so nothing sensitive reaches the screen.
 */
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  const [ref] = useState(() => digest ?? shortRef());

  useEffect(() => {
    console.error(ref, error);
  }, [ref, error]);

  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <SystemState
        icon={OctagonExclamationPoint}
        tone="danger"
        title="Something went wrong."
        action={
          <div className="flex flex-col items-center gap-3.5">
            <Button onClick={() => retry()} className="px-4">
              <RotateCw aria-hidden />
              Try again
            </Button>
            <p className="m-0 font-mono text-xs text-muted-foreground">Ref {ref}</p>
          </div>
        }
      />
    </main>
  );
}
