import type { Metadata } from "next";
import { AdminUsersPage } from "./users-page";

export const metadata: Metadata = { title: "Admin · Users" };

export default function Page() {
  return <AdminUsersPage />;
}
