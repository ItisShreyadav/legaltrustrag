import { Suspense } from "react";
import { AnalyzeApp } from "@/components/AnalyzeApp";

function AppFallback() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]" aria-busy="true">
      <div className="h-96 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
      <div className="h-96 animate-pulse rounded-xl border border-dashed border-zinc-300 bg-white/60 dark:border-zinc-700 dark:bg-zinc-900/40" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          Contract conflict and compliance analysis
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
          Upload related contracts to find clauses that contradict each other or carve out exceptions, and check them
          against your own rules. Every finding is verified against the exact source text; anything that fails
          verification is withheld.
        </p>
      </div>
      {/* useSearchParams (?mock=1) needs a Suspense boundary so the shell above can be prerendered. */}
      <Suspense fallback={<AppFallback />}>
        <AnalyzeApp />
      </Suspense>
    </div>
  );
}
