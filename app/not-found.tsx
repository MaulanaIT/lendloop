import type { Metadata } from "next";
import { PublicHeader } from "@/components/lendloop/public-header";
import { SiteFooter } from "@/components/lendloop/site-footer";
import { SkipLink } from "@/components/lendloop/skip-link";
import { NotFoundState } from "@/components/lendloop/system-page";

export const metadata: Metadata = { title: "Not found" };

/** 404 for unknown routes and notFound() calls. Pages that get NOT_FOUND from Convex render <NotFoundState/> inline. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <PublicHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <NotFoundState />
      </main>
      <SiteFooter />
    </div>
  );
}
