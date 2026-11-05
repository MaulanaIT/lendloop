/** First focusable element of a page with a header: jumps to <main id="main">. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="absolute top-2 -left-[9999px] z-[100] rounded-md border border-border bg-card px-3.5 py-2.5 font-semibold text-foreground no-underline focus:left-4"
    >
      Skip to content
    </a>
  );
}
