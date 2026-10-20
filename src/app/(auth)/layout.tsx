import type { ReactNode } from "react";
import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/** Centred card for /login and /signup: no sidebar, just the brand, the form and a disclaimer. */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="relative flex min-h-svh flex-col bg-muted/40 dark:bg-background">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <main id="main" className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 sm:px-6">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex items-center gap-2.5 self-center text-base font-semibold tracking-tight">
            <BrandMark />
            LegalTrustRAG
          </div>
          {children}
          <p className="text-center text-xs text-balance text-muted-foreground">
            Machine-assisted contract review. Not legal advice.
          </p>
        </div>
      </main>
    </div>
  );
}
