"use client";

import { ErrorState } from "@/components/layout/error-state";

/** Errors in a dashboard page keep the sidebar and top bar; only the content area is replaced. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <ErrorState error={error} retry={retry} />
    </div>
  );
}
