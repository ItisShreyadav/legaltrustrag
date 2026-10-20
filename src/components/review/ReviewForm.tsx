"use client";

import { CheckIcon, CircleAlertIcon, PencilLineIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { MAX_REVIEW_NOTE_CHARS, type ReviewStatus, type ReviewView } from "@/lib/review/types";
import { messageOf, recordDecision } from "./api";

export interface ReviewFormProps {
  review: ReviewView;
  /** Called with the stored row once the server has recorded the decision. */
  onSaved?: (review: ReviewView) => void;
  /** Shows a Cancel button (for revising an earlier decision). */
  onCancel?: () => void;
}

/**
 * A person's decision on one queued finding: Accept, Reject or Needs edit, with
 * an optional one-line note. The server stamps it with the user and the time.
 */
export function ReviewForm({ review, onSaved, onCancel }: ReviewFormProps) {
  const router = useRouter();
  const noteId = useId();
  const hintId = useId();
  const [note, setNote] = useState(review.note);
  const [pending, setPending] = useState<ReviewStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const busy = pending !== null || refreshing;

  async function decide(status: ReviewStatus) {
    if (busy) return;
    setPending(status);
    setError(null);
    try {
      const saved = await recordDecision(review.id, status, note);
      onSaved?.(saved);
      // Re-render server data: the sidebar queue count and, on /review, the list.
      startRefresh(() => router.refresh());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(null);
    }
  }

  const icon = (status: ReviewStatus, Icon: typeof CheckIcon) =>
    pending === status ? <Spinner data-icon="inline-start" aria-hidden="true" /> : <Icon data-icon="inline-start" />;

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      aria-busy={busy}
      aria-label="Review decision"
      className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3"
    >
      <Field>
        <FieldLabel htmlFor={noteId}>Note</FieldLabel>
        <Input
          id={noteId}
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={MAX_REVIEW_NOTE_CHARS}
          disabled={busy}
          placeholder="Optional"
          aria-describedby={hintId}
          className="bg-background"
        />
        <FieldDescription id={hintId}>Saved with your decision, your name and the time.</FieldDescription>
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => decide("accepted")} disabled={busy}>
          {icon("accepted", CheckIcon)}
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => decide("rejected")}
          disabled={busy}
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/50 dark:hover:bg-destructive/20"
        >
          {icon("rejected", XIcon)}
          Reject
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => decide("needs_edit")} disabled={busy}>
          {icon("needs_edit", PencilLineIcon)}
          Needs edit
        </Button>
        {review.status !== "queued" || onCancel ? (
          <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
            {review.status !== "queued" ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => decide("queued")} disabled={busy}>
                {pending === "queued" ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
                Return to queue
              </Button>
            ) : null}
            {onCancel ? (
              <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>The decision was not saved</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
