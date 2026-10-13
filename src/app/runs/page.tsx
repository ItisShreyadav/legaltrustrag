import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RunsTable } from "@/components/runs/RunsTable";
import { requireUser } from "@/lib/auth";
import { listRuns } from "@/lib/runs";

export const metadata: Metadata = { title: "Runs · LegalTrustRAG" };

function Loading() {
  return (
    <p aria-busy="true" className="border-t border-rule pt-5 font-mono text-xs text-muted">
      Loading&hellip;
    </p>
  );
}

/** Validates the session (the proxy does not cover this route) and lists only the user's own runs. */
async function Runs() {
  const user = await requireUser("/runs");
  const runs = listRuns(user.id);
  if (runs.length === 0) {
    return (
      <p className="max-w-[68ch] border-y border-rule py-5 text-[1.0625rem] leading-[1.6] text-muted italic">
        No saved runs yet. Each analysis is saved here when it finishes.{" "}
        <Link href="/" className="link text-ink not-italic">
          Start one
        </Link>
        .
      </p>
    );
  }
  return <RunsTable runs={runs} />;
}

export default function RunsPage() {
  return (
    <div className="mx-auto w-full max-w-[76rem] flex-1 px-4 pt-10 pb-20 sm:px-8 sm:pt-14">
      <div className="md:pl-16">
        <h1 className="max-w-[22ch] text-[2.125rem] leading-[1.15] font-normal tracking-[-0.01em] sm:text-[2.75rem]">
          Saved runs
        </h1>
        <p className="mt-4 max-w-[62ch] text-lg leading-[1.6] text-muted">
          Every analysis is kept with its documents, so a report can be reopened with each quote in its clause and its
          findings sent to a human reviewer.
        </p>
      </div>
      <div className="mt-12 md:pl-16">
        <Suspense fallback={<Loading />}>
          <Runs />
        </Suspense>
      </div>
    </div>
  );
}
