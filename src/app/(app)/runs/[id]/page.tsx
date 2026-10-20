import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ReportView } from "@/components/report/ReportView";
import { DeleteRunButton } from "@/components/runs/delete-run-button";
import { documentTitle, formatUtc, plural, shortRunId } from "@/components/runs/format";
import { RunMeta } from "@/components/runs/run-meta";
import { RunSkeleton } from "@/components/runs/run-skeleton";
import { getSessionUser, requireUser } from "@/lib/auth";
import { reviewsForRun, type ReviewView } from "@/lib/review";
import { RunIdParam, getRun, getRunSummary, type RunReviewCounts } from "@/lib/runs";

type Params = Promise<{ id: string }>;

/**
 * The run's document names as the tab title. Reads the session, so it resolves
 * at request time alongside the page body (which is dynamic anyway). Only the
 * owner gets the names; anyone else gets the generic title.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const parsed = RunIdParam.safeParse({ id });
  const user = parsed.success ? await getSessionUser() : null;
  const run = user && parsed.success ? getRunSummary(user.id, parsed.data.id) : null;
  return { title: run ? documentTitle(run.documentNames) : "Run" };
}

function countReviews(reviews: readonly ReviewView[]): RunReviewCounts {
  const counts: RunReviewCounts = { queued: 0, accepted: 0, rejected: 0, needs_edit: 0 };
  for (const review of reviews) counts[review.status] += 1;
  return counts;
}

/** Only the owner's run is shown; any other id, malformed or not theirs, is a 404. */
async function SavedRunView({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser(`/runs/${encodeURIComponent(id)}`);
  const parsed = RunIdParam.safeParse({ id });
  const run = parsed.success ? getRun(user.id, parsed.data.id) : null;
  if (!run) notFound();
  const reviews = reviewsForRun(user.id, run.id);
  const title = documentTitle(run.documentNames, 3);

  return (
    <>
      <PageHeader
        title={title}
        className="[&_h1]:break-words"
        description={
          <>
            Saved{" "}
            <time dateTime={run.createdAt} className="font-mono text-xs">
              {formatUtc(run.createdAt)}
            </time>{" "}
            <span aria-hidden="true">&middot;</span> {plural(run.ruleCount, "rule")}{" "}
            <span aria-hidden="true">&middot;</span> run{" "}
            <span className="font-mono text-xs" title={run.id}>
              {shortRunId(run.id)}
            </span>
          </>
        }
        actions={<DeleteRunButton run={{ id: run.id, label: title, reviewCount: reviews.length }} />}
      />
      <RunMeta run={run} reviews={countReviews(reviews)} />
      <ReportView report={run.report} docTexts={run.docTexts} runId={run.id} reviews={reviews} />
    </>
  );
}

export default function SavedRunPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RunSkeleton />}>
      <SavedRunView params={params} />
    </Suspense>
  );
}
