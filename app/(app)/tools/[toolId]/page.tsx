import type { Metadata } from "next";
import { ToolDetail } from "@/components/lendloop/tools/tool-detail";

export const metadata: Metadata = { title: "Tool" };

export default function ToolPage() {
  return <ToolDetail />;
}
