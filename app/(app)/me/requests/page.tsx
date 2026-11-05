import type { Metadata } from "next";
import { MyRequestsPage } from "./requests-page";

export const metadata: Metadata = { title: "My requests" };

export default function Page() {
  return <MyRequestsPage />;
}
