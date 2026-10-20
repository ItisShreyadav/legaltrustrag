"use client";

import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ReviewView } from "@/lib/review/types";
import { ReviewForm } from "./ReviewForm";
import { ReviewStatusLine } from "./ReviewStatusLine";

/**
 * Decision area of one entry on /review: the form while the finding is queued;
 * afterwards the recorded decision with a Revise action. Shows the saved row
 * straight away while the page refreshes its server data.
 */
export function ReviewDecision({ review }: { review: ReviewView }) {
  const [saved, setSaved] = useState<ReviewView | null>(null);
  const [revising, setRevising] = useState(false);
  const current = saved && saved.updatedAt >= review.updatedAt ? saved : review;
  const showForm = current.status === "queued" || revising;

  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite">
        <ReviewStatusLine
          review={current}
          action={
            showForm ? null : (
              <Button variant="ghost" size="xs" onClick={() => setRevising(true)}>
                <PencilIcon aria-hidden="true" data-icon="inline-start" />
                Revise
              </Button>
            )
          }
        />
      </div>
      {showForm ? (
        <ReviewForm
          key={current.updatedAt}
          review={current}
          onSaved={(row) => {
            setSaved(row);
            setRevising(false);
          }}
          onCancel={current.status === "queued" ? undefined : () => setRevising(false)}
        />
      ) : null}
    </div>
  );
}
