import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Logo } from "@/components/lendloop/logo";

export const metadata: Metadata = { title: "Sign in" };

/** Redirect fallback for protected routes (proxy.ts). The landing CTA opens Clerk's modal instead. */
export default function SignInPage() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-background px-4 py-12">
      <div className="flex flex-col items-center gap-6">
        <Logo href="/" label="LendLoop home" />
        <h1 className="sr-only">Sign in to LendLoop</h1>
        <SignIn />
      </div>
    </main>
  );
}
