"use client";

import { ErrorState } from "@/components/layout/error-state";

/** Root error boundary: errors outside the dashboard shell (auth pages, the shell itself). */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="main" className="flex min-h-svh items-center justify-center p-4 sm:p-6">
      <ErrorState error={error} retry={retry} />
    </main>
  );
}
