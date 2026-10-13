import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LegalTrustRAG",
  description: "Self-verifying AI for legal conflict detection and compliance analysis",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow dark:focus:bg-zinc-900"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white dark:bg-indigo-500"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 4.5 6v5.25c0 4.5 3.2 8.1 7.5 9.75 4.3-1.65 7.5-5.25 7.5-9.75V6L12 3Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <span className="truncate text-base font-semibold tracking-tight">LegalTrustRAG</span>
              <span className="hidden truncate text-sm text-zinc-500 md:inline dark:text-zinc-400">
                Self-verifying contract review
              </span>
            </div>
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-600/20 ring-inset dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30">
              Not legal advice
            </span>
          </div>
        </header>
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
        <footer className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-5 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 dark:text-zinc-400">
            <p>LegalTrustRAG: self-verifying retrieval for contract conflict detection and compliance checks.</p>
            <p>Machine-generated output. Have a qualified lawyer review it before relying on it.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
