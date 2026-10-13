import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportView } from "@/components/report/ReportView";
import { NumberedHeading } from "@/components/report/ui";
import { documentList, formatUtc, shortRunId } from "@/components/runs/format";
import { requireUser } from "@/lib/auth";
import { reviewsForRun } from "@/lib/review";
import { RunIdParam, getRun } from "@/lib/runs";

export const metadata: Metadata = { title: "Saved run · LegalTrustRAG" };

type Params = Promise<{ id: string }>;

function Loading() {
  return (
    <p aria-busy="true" className="font-mono text-xs text-muted md:pl-16">
      Loading&hellip;
    </p>
  );
}

/** Only the owner's run is shown; any other id, malformed or not theirs, is a 404. */
async function SavedRunView({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser(`/runs/${encodeURIComponent(id)}`);
  const parsed = RunIdParam.safeParse({ id });
  const run = parsed.success ? getRun(user.id, parsed.data.id) : null;
  if (!run) notFound();
  const reviews = reviewsForRun(user.id, run.id);
  const rules = `${run.ruleCount} ${run.ruleCount === 1 ? "rule" : "rules"}`;

  return (
    <>
      <div className="md:pl-16">
        <p className="font-mono text-[0.75rem] leading-5 text-muted">
          <Link href="/runs" className="link text-ink">
            Runs
          </Link>
          <span aria-hidden="true" className="px-[0.5ch]">
            ›
          </span>
          <span className="sr-only">, </span>
          run <span title={run.id}>{shortRunId(run.id)}</span>
        </p>
        <h1 className="mt-3 max-w-[30ch] text-[2.125rem] leading-[1.15] font-normal tracking-[-0.01em] break-words sm:text-[2.75rem]">
          {documentList(run.documentNames)}
        </h1>
        <p className="mt-4 max-w-[62ch] text-lg leading-[1.6] text-muted">
          Saved <span className="figures">{formatUtc(run.createdAt)}</span>, checked against {rules}. The report is
          shown as the system produced it; review decisions are recorded separately, each under the reviewer&rsquo;s
          name.
        </p>
      </div>
      <section aria-labelledby="report-heading" className="mt-12 border-t border-rule pt-7 md:pl-16">
        <NumberedHeading id="report-heading" number="1." title="Report" />
        <div className="mt-5">
          <ReportView report={run.report} docTexts={run.docTexts} sectionNumber="1" runId={run.id} reviews={reviews} />
        </div>
      </section>
    </>
  );
}

export default function SavedRunPage({ params }: { params: Params }) {
  return (
    <div className="mx-auto w-full max-w-[76rem] flex-1 px-4 pt-10 pb-20 sm:px-8 sm:pt-14">
      <Suspense fallback={<Loading />}>
        <SavedRunView params={params} />
      </Suspense>
    </div>
  );
}
