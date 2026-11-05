"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button, type ButtonProps } from "@/components/ui/button";

export type LandingCtaProps = {
  size?: ButtonProps["size"];
  /** Trailing arrow (hero CTA). */
  withArrow?: boolean;
  className?: string;
};

/**
 * "Sign in to lend or borrow" (Clerk modal) for visitors, "Go to the board"
 * once signed in. While Clerk is still loading we render the sign-in button so
 * the hero CTA is there immediately.
 */
export function LandingCta({ size = "md", withArrow = false, className }: LandingCtaProps) {
  const { isSignedIn } = useAuth();
  const arrow = withArrow ? <ArrowRight aria-hidden /> : null;

  if (isSignedIn) {
    return (
      <Button asChild size={size} className={className}>
        <Link href="/tools">
          Go to the board
          {arrow}
        </Link>
      </Button>
    );
  }
  return (
    <SignInButton mode="modal" forceRedirectUrl="/tools">
      <Button size={size} className={className}>
        Sign in to lend or borrow
        {arrow}
      </Button>
    </SignInButton>
  );
}
