import type { Metadata } from "next";
import { MyListingsPage } from "./listings-page";

export const metadata: Metadata = { title: "My listings" };

export default function Page() {
  return <MyListingsPage />;
}
