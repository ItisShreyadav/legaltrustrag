import type { ReactNode } from "react";
import { REVIEW_STATUS_LABEL, type ReviewView } from "@/lib/review/types";
import { Sep } from "../report/ui";
import { formatUtc } from "../runs/format";

/**
 * "ACCEPTED · Reviewed by Jane Doe on 2026-10-13 14:12 UTC", then the reviewer's
 * note. Every status is a person's decision, so the line always names them.
 */
export function ReviewStatusLine({ review, action }: { review: ReviewView; action?: ReactNode }) {
  const decided = review.status !== "queued";
  return (
    <div className="max-w-[68ch]">
      <p className="text-[0.9375rem] leading-6 text-muted">
        <span className="sr-only">Human review status: </span>
        <span className="smallcaps font-semibold text-ink">{REVIEW_STATUS_LABEL[review.status]}</span>
        <Sep />
        {decided ? "Reviewed by " : "Sent to review by "}
        <span className="text-ink">{review.userName}</span> on{" "}
        <span className="figures">{formatUtc(review.updatedAt)}</span>
        {action ? (
          <>
            <Sep />
            {action}
          </>
        ) : null}
      </p>
      {review.note ? (
        <p className="mt-0.5 text-[0.9375rem] leading-[1.55] break-words">
          <span className="smallcaps text-muted">Note.</span> <span className="italic">{review.note}</span>
        </p>
      ) : null}
    </div>
  );
}
