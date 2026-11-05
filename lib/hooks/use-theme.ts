"use client";

import { useCallback, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/lib/config";

export type ThemePreference = "light" | "dark" | "system";
const CHANGE_EVENT = "lendloop-theme-change";

/**
 * Applies a preference to <html>. globals.css follows the OS unless
 * data-theme pins "light" or "dark", so "system" simply removes the attribute.
 * Keep in sync with the inline bootstrap in components/lendloop/theme-script.tsx.
 */
export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

function read(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    // Private mode or blocked storage: fall back to the OS setting.
    return "system";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Light / Dark / System preference, persisted per browser. */
export function useTheme(): { theme: ThemePreference; setTheme: (t: ThemePreference) => void } {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as const);

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice still applies for this page view.
    }
    applyTheme(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { theme, setTheme };
}
