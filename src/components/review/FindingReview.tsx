"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { messageOf, requestReview } from "./api";
import { ReviewForm } from "./ReviewForm";
import { useReviews } from "./ReviewProvider";
import { ReviewStatusLine } from "./ReviewStatusLine";

const MONO_LINK = "link font-mono text-[0.75rem] text-ink";

/**
 * Human-review control under one finding of a saved run: "Send to review", then
 * the status, the reviewer and their note, with an inline form to decide.
 * Renders nothing outside a ReviewProvider (a report that was not saved).
 */
export function FindingReview({ findingId }: { findingId: string }) {
  const reviews = useReviews();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!reviews) return null;
  const { runId, upsert } = reviews;
  const review = reviews.byFinding.get(findingId);

  async function send() {
    setSending(true);
    setError(null);
    try {
      upsert(await requestReview(runId, findingId));
      router.refresh(); // header queue count
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div aria-live="polite">
        {review ? (
          <ReviewStatusLine
            review={review}
            action={
              deciding ? null : (
                <button type="button" onClick={() => setDeciding(true)} className={MONO_LINK}>
                  {review.status === "queued" ? "Mark reviewed" : "Revise"}
                </button>
              )
            }
          />
        ) : (
          <p className="leading-6">
            <button type="button" onClick={send} disabled={sending} className={MONO_LINK}>
              {sending ? "Sending…" : "Send to review"}
            </button>
            {error ? <span className="ml-[1.5ch] text-[0.875rem] text-accent italic">{error}</span> : null}
          </p>
        )}
      </div>
      {review && deciding ? (
        <div className="mt-3">
          <ReviewForm
            review={review}
            onSaved={(saved) => {
              upsert(saved);
              setDeciding(false);
            }}
            onCancel={() => setDeciding(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
