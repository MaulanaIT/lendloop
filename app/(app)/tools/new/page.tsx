import type { Metadata } from "next";
import { NewToolScreen } from "@/components/lendloop/tools/tool-form-screen";

export const metadata: Metadata = { title: "List a tool" };

export default function NewToolPage() {
  return <NewToolScreen />;
}
