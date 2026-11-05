import { ArrowDown } from "lucide-react";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/lendloop/public-header";
import { SiteFooter } from "@/components/lendloop/site-footer";
import { SkipLink } from "@/components/lendloop/skip-link";
import { AvailableNow } from "@/components/lendloop/tools/available-now";
import { LandingCta } from "@/components/lendloop/tools/landing-cta";
import { LoopHousesArt } from "@/components/lendloop/tools/loop-houses-art";

export const metadata: Metadata = {
  title: { absolute: "LendLoop — Borrow what you need. Lend what you don't." },
};

const STEPS = [
  { title: "List", body: "Share a tool you rarely use." },
  { title: "Request", body: "Pick the days you need it." },
  { title: "Return", body: "Hand it back. The owner marks it returned." },
] as const;

/** Public landing (brief B2): visitors see tool names and categories only. */
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <PublicHeader showHowItWorks>
        <LandingCta className="whitespace-normal text-center" />
      </PublicHeader>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <section
          aria-labelledby="hero-h"
          className="mx-auto grid max-w-6xl items-center gap-[clamp(32px,5vw,64px)] px-4 pt-[clamp(40px,8vw,88px)] pb-[clamp(40px,6vw,72px)] sm:px-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:px-8"
        >
          <div className="flex min-w-0 flex-col items-start">
            <h1
              id="hero-h"
              className="m-0 max-w-[560px] font-display text-[clamp(36px,6vw,48px)] leading-[1.05] font-bold tracking-[-0.02em] text-balance"
            >
              Borrow what you need. Lend what you don&apos;t.
            </h1>
            <p className="m-0 mt-5 max-w-[460px] text-lg leading-[1.55] text-muted-foreground text-pretty">
              A lending board for your neighborhood. Free, between neighbors.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2">
              <LandingCta size="lg" withArrow />
              <a
                href="#how-it-works"
                className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] font-semibold text-foreground no-underline transition-colors duration-150 hover:text-primary"
              >
                How it works
                <ArrowDown aria-hidden className="size-4" />
              </a>
            </div>
          </div>
          <div className="flex min-w-0 justify-start md:justify-end">
            <LoopHousesArt className="max-w-[240px] md:max-w-[420px]" />
          </div>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-h"
          className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-[clamp(48px,7vw,80px)] sm:px-6 lg:px-8"
        >
          <h2 id="how-h" className="m-0 font-display text-2xl font-semibold">
            How it works
          </h2>
          <ol className="m-0 mt-5 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-[clamp(16px,2vw,24px)] p-0">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3.5 border-t border-border pt-5">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-primary font-display text-base font-semibold text-primary tabular"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="m-0 mt-1 font-display text-lg font-semibold">{step.title}</h3>
                  <p className="m-0 mt-1 text-base text-muted-foreground text-pretty">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <AvailableNow />
      </main>

      <SiteFooter />
    </div>
  );
}
