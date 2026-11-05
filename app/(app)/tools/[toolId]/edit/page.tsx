import type { Metadata } from "next";
import { EditToolScreen } from "@/components/lendloop/tools/tool-form-screen";

export const metadata: Metadata = { title: "Edit listing" };

export default function EditToolPage() {
  return <EditToolScreen />;
}
