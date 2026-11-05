import type { Metadata } from "next";
import { IncomingPage } from "./incoming-page";

export const metadata: Metadata = { title: "Incoming" };

export default function Page() {
  return <IncomingPage />;
}
