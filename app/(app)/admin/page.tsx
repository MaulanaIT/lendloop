import { redirect } from "next/navigation";

/** /admin has no page of its own; Loans is the first section. */
export default function AdminIndexPage() {
  redirect("/admin/loans");
}
