"use client";

import { PencilIcon, SendIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { messageOf, requestReview } from "./api";
import { ReviewForm } from "./ReviewForm";
import { useReviews } from "./ReviewProvider";
import { ReviewStatusLine } from "./ReviewStatusLine";

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
  if (!reviews) return null;
  const { runId, upsert } = reviews;
  const review = reviews.byFinding.get(findingId);

  async function send() {
    setSending(true);
    try {
      upsert(await requestReview(runId, findingId));
      router.refresh(); // sidebar queue count
      toast.success("Sent to review", {
        action: { label: "Open queue", onClick: () => router.push("/review") },
      });
    } catch (err) {
      toast.error("Could not send to review", { description: messageOf(err) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite">
        {review ? (
          <ReviewStatusLine
            review={review}
            action={
              deciding ? null : (
                <Button variant="ghost" size="xs" onClick={() => setDeciding(true)}>
                  <PencilIcon data-icon="inline-start" />
                  {review.status === "queued" ? "Record decision" : "Revise"}
                </Button>
              )
            }
          />
        ) : (
          <Button variant="ghost" size="sm" onClick={send} disabled={sending} className="-ml-2.5">
            {sending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : <SendIcon data-icon="inline-start" />}
            {sending ? "Sending…" : "Send to review"}
          </Button>
        )}
      </div>
      {review && deciding ? (
        <ReviewForm
          review={review}
          onSaved={(saved) => {
            upsert(saved);
            setDeciding(false);
          }}
          onCancel={() => setDeciding(false)}
        />
      ) : null}
    </div>
  );
}
