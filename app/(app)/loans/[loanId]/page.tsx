import type { Metadata } from "next";
import { LoanPage } from "./loan-page";

export const metadata: Metadata = { title: "Loan" };

export default function Page() {
  return <LoanPage />;
}
