"use client";

import type { ReactNode } from "react";
import { AppNav } from "@/components/lendloop/app-nav";
import { OfflineBanner } from "@/components/lendloop/banners";
import { MobileTabBar } from "@/components/lendloop/mobile-tab-bar";
import { SiteFooter } from "@/components/lendloop/site-footer";
import { SkipLink } from "@/components/lendloop/skip-link";
import { api } from "@/convex/_generated/api";
import { useAppQuery } from "@/lib/hooks/use-app-query";
import { useViewer } from "@/lib/hooks/use-viewer";

/**
 * Signed-in shell: skip link, AppNav (desktop header / mobile top bar),
 * <main id="main">, desktop footer, mobile tab bar, offline pill.
 * proxy.ts already redirects visitors to /sign-in; every Convex query here
 * re-checks identity on the server.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { viewer } = useViewer();
  const { data: counts } = useAppQuery(api.users.navCounts, {});

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AppNav viewer={viewer} counts={counts} />
      <OfflineBanner />
      {/* 88px bottom padding keeps content clear of the mobile tab bar. */}
      <main id="main" tabIndex={-1} className="flex-1 pb-[88px] outline-none md:pb-0">
        {children}
      </main>
      <SiteFooter className="hidden md:block" />
      <MobileTabBar counts={counts} />
    </div>
  );
}
