import type { ReactNode } from "react";
import { Logo } from "./logo";

export type PublicHeaderProps = {
  /** Show the "How it works" anchor link (landing page, ≥768px). */
  showHowItWorks?: boolean;
  /** Right-side CTA, e.g. <SignInButton mode="modal"><Button>Sign in to lend or borrow</Button></SignInButton>. */
  children?: ReactNode;
};

/** Visitor header: logo (home) on the left, optional "How it works" + CTA on the right. */
export function PublicHeader({ showHowItWorks = false, children }: PublicHeaderProps) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-5 px-4 sm:px-6 lg:px-8">
        <Logo href="/" label="LendLoop home" className="mr-auto" />
        {showHowItWorks ? (
          <a
            href="#how-it-works"
            className="hidden px-1 py-2 font-medium text-foreground no-underline transition-colors duration-150 hover:text-primary md:inline"
          >
            How it works
          </a>
        ) : null}
        {children}
      </div>
    </header>
  );
}
