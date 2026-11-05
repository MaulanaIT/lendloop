import type { Metadata } from "next";
import { AdminListingsPage } from "./listings-page";

export const metadata: Metadata = { title: "Admin · Listings" };

export default function Page() {
  return <AdminListingsPage />;
}
