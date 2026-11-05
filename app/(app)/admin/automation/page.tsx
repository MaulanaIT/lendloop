import type { Metadata } from "next";
import { AdminAutomationPage } from "./automation-page";

export const metadata: Metadata = { title: "Admin · Automation" };

export default function Page() {
  return <AdminAutomationPage />;
}
