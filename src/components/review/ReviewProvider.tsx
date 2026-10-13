"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ReviewView } from "@/lib/review/types";

interface ReviewsContextValue {
  runId: string;
  /** Every review row of this run, in the order they were created. */
  reviews: ReviewView[];
  byFinding: ReadonlyMap<string, ReviewView>;
  /** Replace (or add) a row after the server confirmed a change. */
  upsert: (review: ReviewView) => void;
}

const ReviewsContext = createContext<ReviewsContextValue | null>(null);

/** Review state for one saved run, shared by every finding control in its report and by the JSON export. */
export function ReviewProvider({ runId, initial, children }: { runId: string; initial: ReviewView[]; children: ReactNode }) {
  const [reviews, setReviews] = useState<ReviewView[]>(initial);
  const value = useMemo<ReviewsContextValue>(
    () => ({
      runId,
      reviews,
      byFinding: new Map(reviews.map((r) => [r.findingId, r])),
      upsert: (review) =>
        setReviews((current) => [
          ...current.filter((r) => r.id !== review.id && r.findingId !== review.findingId),
          review,
        ]),
    }),
    [runId, reviews],
  );
  return <ReviewsContext.Provider value={value}>{children}</ReviewsContext.Provider>;
}

/** The run's review state, or null outside a saved run (e.g. a report with no run id). */
export function useReviews(): ReviewsContextValue | null {
  return useContext(ReviewsContext);
}
