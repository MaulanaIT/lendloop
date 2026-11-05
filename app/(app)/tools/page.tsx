import type { Metadata } from "next";
import { Suspense } from "react";
import { BrowseTools } from "@/components/lendloop/tools/browse-tools";

export const metadata: Metadata = { title: "Browse tools" };

export default function BrowsePage() {
  // BrowseTools reads the filters from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <BrowseTools />
    </Suspense>
  );
}
