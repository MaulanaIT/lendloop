import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Logo } from "@/components/lendloop/logo";

export const metadata: Metadata = { title: "Sign up" };

/** Clerk sign-up, centered on the warm background with the LendLoop lockup. */
export default function SignUpPage() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-background px-4 py-12">
      <div className="flex flex-col items-center gap-6">
        <Logo href="/" label="LendLoop home" />
        <h1 className="sr-only">Create your LendLoop account</h1>
        <SignUp />
      </div>
    </main>
  );
}
