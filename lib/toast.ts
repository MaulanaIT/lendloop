"use client";

import type { LucideIcon } from "lucide-react";
import { createElement, type ReactNode } from "react";
import { toast as sonner } from "sonner";
import { ToastView, type ToastTone } from "@/components/ui/toast";
import { parseAppError } from "@/lib/domain/errors";

export type ToastOptions = {
  description?: ReactNode;
  icon?: LucideIcon;
  action?: { label: string; onClick: () => void };
  /** Reuse an id to replace a toast in place instead of stacking. */
  id?: string | number;
};

/** Brief A8: success/info/warning auto-dismiss after 4s; errors stay until dismissed. */
const AUTO_DISMISS_MS = 4000;

function show(tone: ToastTone, title: ReactNode, opts: ToastOptions = {}, persist = false) {
  return sonner.custom(
    (id) =>
      createElement(ToastView, {
        tone,
        title,
        description: opts.description,
        icon: opts.icon,
        action: opts.action,
        onDismiss: () => sonner.dismiss(id),
      }),
    { id: opts.id, duration: persist ? Infinity : AUTO_DISMISS_MS },
  );
}

/**
 * App toasts. Rendered by <AppToaster/> (bottom-right on desktop, top-center
 * on mobile) inside an aria-live="polite" region.
 *
 *   toast.success(TOAST_COPY.approved("Sam R."))
 *   toast.error("Couldn't save your changes", { description: "Your changes are kept.", onRetry: save })
 */
export const toast = {
  success: (title: ReactNode, opts?: ToastOptions) => show("success", title, opts),
  info: (title: ReactNode, opts?: ToastOptions) => show("info", title, opts),
  warning: (title: ReactNode, opts?: ToastOptions) => show("warning", title, opts),
  /** Neutral toast ("Signed out", offline notices). */
  message: (title: ReactNode, opts?: ToastOptions) => show("muted", title, opts),
  /** Persists until dismissed; `onRetry` adds a [Retry] button. */
  error: (title: ReactNode, opts: ToastOptions & { onRetry?: () => void } = {}) =>
    show(
      "error",
      title,
      { ...opts, action: opts.action ?? (opts.onRetry ? { label: "Retry", onClick: opts.onRetry } : undefined) },
      true,
    ),
  /** Persistent warning with an action, e.g. "Your session expired." [Sign in]. */
  sticky: (title: ReactNode, opts?: ToastOptions) => show("warning", title, opts, true),
  dismiss: (id?: string | number) => sonner.dismiss(id),
};

/**
 * Error toast for a failed Convex mutation: maps ConvexError codes to copy
 * (lib/domain/errors.ts). Never shows raw messages or stack traces.
 * Returns the parsed error so callers can branch (e.g. VALIDATION → field errors).
 */
export function toastAppError(err: unknown, opts: { onRetry?: () => void } = {}) {
  const parsed = parseAppError(err);
  toast.error(parsed.copy, { onRetry: opts.onRetry });
  return parsed;
}
