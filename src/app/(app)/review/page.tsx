import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ReviewEntry, runDocLookup } from "@/components/review/ReviewEntry";
import { ReviewQueueEmpty } from "@/components/review/review-queue-empty";
import { ReviewQueueSkeleton } from "@/components/review/review-queue-skeleton";
import { ReviewTabs } from "@/components/review/ReviewTabs";
import { requireUser } from "@/lib/auth";
import { REVIEW_STATUS_LABEL, ReviewListQuery, listReviews, reviewCounts, type ReviewFilter } from "@/lib/review";

export const metadata: Metadata = { title: "Review queue" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The user's own reviews only; findings render on the server, so document texts never reach the browser here. */
async function Queue({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).status;
  const parsed = ReviewListQuery.safeParse({ status: typeof raw === "string" ? raw : undefined });
  const filter: ReviewFilter = parsed.success ? parsed.data.status : "queued";
  const user = await requireUser(filter === "queued" ? "/review" : `/review?status=${filter}`);
  const counts = reviewCounts(user.id);
  const { items, runs, truncated } = listReviews(user.id, filter);
  const listLabel = filter === "all" ? "All reviewed findings" : `Findings: ${REVIEW_STATUS_LABEL[filter]}`;

  return (
    <ReviewTabs active={filter} counts={counts}>
      {items.length === 0 ? (
        <ReviewQueueEmpty filter={filter} />
      ) : (
        <ol aria-label={listLabel} className="flex flex-col gap-4">
          {items.map((item) => (
            <ReviewEntry key={item.review.id} item={item} docs={runDocLookup(runs.get(item.run.id))} />
          ))}
        </ol>
      )}
      {truncated ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing the {items.length} most recent.
        </p>
      ) : null}
    </ReviewTabs>
  );
}

export default function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Review queue"
        description="Findings sent for human review. Each decision is a person's, recorded with their name and the time; the system never decides on its own."
      />
      <Suspense fallback={<ReviewQueueSkeleton />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </>
  );
}
