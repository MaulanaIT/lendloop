import { THEME_STORAGE_KEY } from "@/lib/config";

// Runs before first paint so a pinned Light/Dark choice never flashes the
// other theme. Static string, no user input: safe to inline.
const script = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

/** Render inside <head> of the root layout (with suppressHydrationWarning on <html>). */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
