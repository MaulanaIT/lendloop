import { DEFAULT_TIME_ZONE, todayISO } from "./domain/dates";

/** Neighborhood timezone used to resolve "today" in the browser. Must match Convex's APP_TIME_ZONE. */
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || DEFAULT_TIME_ZONE;

export function clientToday(): string {
  return todayISO(Date.now(), APP_TIME_ZONE);
}

/** localStorage key for the Light/Dark/System choice. Here, not in the hook, so the server-rendered ThemeScript can import it. */
export const THEME_STORAGE_KEY = "lendloop-theme";
