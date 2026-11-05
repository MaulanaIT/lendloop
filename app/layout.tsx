import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { ThemeScript } from "@/components/lendloop/theme-script";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600"] });
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700"],
});
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "LendLoop — Borrow what you need. Lend what you don't.", template: "%s · LendLoop" },
  description: "A lending board for your neighborhood. Free, between neighbors.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${bricolage.variable} ${jetbrains.variable}`}
      // The theme bootstrap sets data-theme before hydration.
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh">
        <ClerkProvider
          appearance={{
            // Theme tokens, not hex values, so sign-in follows light/dark like
            // the rest of the app (Clerk resolves CSS variables at runtime).
            variables: {
              colorPrimary: "var(--primary)",
              colorPrimaryForeground: "var(--primary-foreground)",
              colorBackground: "var(--card)",
              colorForeground: "var(--foreground)",
              colorMutedForeground: "var(--muted-foreground)",
              colorMuted: "var(--muted)",
              colorInput: "var(--card)",
              colorInputForeground: "var(--foreground)",
              colorNeutral: "var(--foreground)",
              colorBorder: "var(--border)",
              colorRing: "var(--ring)",
              colorDanger: "var(--destructive)",
              borderRadius: "0.5rem",
              fontFamily: "Inter, system-ui, sans-serif",
            },
            // Clerk derives control borders from colorNeutral at a low alpha,
            // which is near-invisible on the white card. Match our own inputs
            // (control-border, 3:1 against the card). Clerk's CSS is unlayered,
            // so these Tailwind utilities need the important modifier to win.
            elements: {
              formFieldInput:
                "border! border-control-border! bg-card! shadow-none! focus:border-ring! focus:shadow-[0_0_0_1px_var(--ring)]!",
              socialButtonsBlockButton: "border! border-control-border! shadow-none! hover:bg-muted!",
              otpCodeFieldInput: "border! border-control-border! shadow-none! focus:border-ring!",
            },
          }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
