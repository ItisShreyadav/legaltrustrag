import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ReviewEntry, runDocLookup } from "@/components/review/ReviewEntry";
import { ReviewTabs } from "@/components/review/ReviewTabs";
import { requireUser } from "@/lib/auth";
import { ReviewListQuery, listReviews, reviewCounts, type ReviewFilter } from "@/lib/review";

export const metadata: Metadata = { title: "Review queue · LegalTrustRAG" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const EMPTY: Record<ReviewFilter, string> = {
  queued: "Nothing is waiting for review. Send a finding to review from any saved run.",
  accepted: "No findings have been accepted yet.",
  rejected: "No findings have been rejected yet.",
  needs_edit: "No findings are marked as needing an edit.",
  all: "No findings have been sent to review yet.",
};

function Loading() {
  return (
    <p aria-busy="true" className="font-mono text-xs text-muted">
      Loading&hellip;
    </p>
  );
}

/** The user's own reviews only; findings render on the server, so document texts never reach the browser here. */
async function Queue({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).status;
  const parsed = ReviewListQuery.safeParse({ status: typeof raw === "string" ? raw : undefined });
  const filter: ReviewFilter = parsed.success ? parsed.data.status : "queued";
  const user = await requireUser(filter === "queued" ? "/review" : `/review?status=${filter}`);
  const counts = reviewCounts(user.id);
  const { items, runs, truncated } = listReviews(user.id, filter);

  return (
    <>
      <ReviewTabs active={filter} counts={counts} />
      {items.length === 0 ? (
        <p className="max-w-[68ch] py-6 text-[1.0625rem] leading-[1.6] text-muted italic">
          {EMPTY[filter]}{" "}
          {filter === "queued" ? (
            <Link href="/runs" className="link text-ink not-italic">
              Open your runs
            </Link>
          ) : null}
        </p>
      ) : (
        <ol aria-label="Findings" className="border-b border-rule [&>li:first-child>article]:border-t-0">
          {items.map((item) => (
            <ReviewEntry key={item.review.id} item={item} docs={runDocLookup(runs.get(item.run.id))} />
          ))}
        </ol>
      )}
      {truncated ? (
        <p className="mt-4 font-mono text-[0.75rem] text-muted">Showing the {items.length} most recent.</p>
      ) : null}
    </>
  );
}

export default function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto w-full max-w-[76rem] flex-1 px-4 pt-10 pb-20 sm:px-8 sm:pt-14">
      <div className="md:pl-16">
        <h1 className="max-w-[22ch] text-[2.125rem] leading-[1.15] font-normal tracking-[-0.01em] sm:text-[2.75rem]">
          Review queue
        </h1>
        <p className="mt-4 max-w-[62ch] text-lg leading-[1.6] text-muted">
          Findings sent to a human reviewer. The system assists; it never acts on its own. Each decision here is a
          person&rsquo;s, recorded with their name and the time.
        </p>
      </div>
      <div className="mt-12 md:pl-16">
        <Suspense fallback={<Loading />}>
          <Queue searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
