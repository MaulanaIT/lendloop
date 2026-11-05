"use client";

import { Toaster } from "sonner";
import { useIsDesktop } from "./use-media-query";

/**
 * Toast region (brief A8/B16): bottom-right on desktop, top-center under the
 * 56px mobile top bar. Sonner renders an aria-live="polite" section.
 */
export function AppToaster() {
  const desktop = useIsDesktop();
  return (
    <Toaster
      position={desktop ? "bottom-right" : "top-center"}
      // Sonner applies mobileOffset only up to 600px; 601–767px is still the
      // mobile layout, so the top offset clears the 56px top bar there too.
      offset={desktop ? 24 : { top: 64, left: 12, right: 12 }}
      mobileOffset={{ top: 64, left: 12, right: 12 }}
      gap={8}
      visibleToasts={4}
      containerAriaLabel="Notifications"
      toastOptions={{ unstyled: true }}
    />
  );
}
