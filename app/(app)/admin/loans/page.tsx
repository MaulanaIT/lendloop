import type { Metadata } from "next";
import { AdminLoansPage } from "./loans-page";

export const metadata: Metadata = { title: "Admin · Loans" };

export default function Page() {
  return <AdminLoansPage />;
}
