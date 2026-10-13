import { Suspense } from "react";
import { AnalyzeApp } from "@/components/AnalyzeApp";

function AppFallback() {
  return (
    <div aria-busy="true" className="mt-12 border-t border-rule pt-8">
      <p className="font-mono text-xs text-muted">Loading&hellip;</p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[76rem] flex-1 px-4 pt-10 pb-20 sm:px-8 sm:pt-14">
      <div className="md:pl-16">
        <h1 className="figures max-w-[22ch] text-[2.125rem] leading-[1.15] font-normal tracking-[-0.01em] sm:text-[2.75rem]">
          Contract conflict and compliance review
        </h1>
        <p className="mt-4 max-w-[62ch] text-lg leading-[1.6] text-muted">
          Clauses that contradict one another or carve out exceptions, and the rules each contract meets or breaks.
          Every finding is tied to an exact quote from the source; anything that cannot be verified is withheld.
        </p>
      </div>
      {/* useSearchParams (?mock=1) needs a Suspense boundary so the shell above can be prerendered. */}
      <Suspense fallback={<AppFallback />}>
        <AnalyzeApp />
      </Suspense>
    </div>
  );
}
