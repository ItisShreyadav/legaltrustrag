import type { Metadata } from "next";
import { JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const serif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LegalTrustRAG",
  description: "Self-verifying contract review: clause conflicts and compliance, each tied to an exact quote.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-paper font-serif text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:border focus:border-ink focus:bg-paper focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <header className="border-b border-rule">
          <div className="mx-auto flex w-full max-w-[76rem] flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-4 sm:px-8">
            <p className="smallcaps text-xl leading-none font-semibold tracking-[0.09em]">LegalTrustRAG</p>
            <p className="font-mono text-[0.6875rem] leading-none text-muted">Working draft · not legal advice</p>
          </div>
        </header>
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
        <footer className="border-t border-rule">
          <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-1 px-4 py-6 text-sm text-muted sm:flex-row sm:items-baseline sm:justify-between sm:px-8">
            <p>
              <span className="smallcaps">LegalTrustRAG</span>, self-verifying retrieval for contract review.
            </p>
            <p className="italic">Machine-generated output. Have a qualified lawyer review it before relying on it.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
