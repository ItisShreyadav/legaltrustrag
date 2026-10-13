"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { MAX_REVIEW_NOTE_CHARS, type ReviewStatus, type ReviewView } from "@/lib/review/types";
import { Sep } from "../report/ui";
import { messageOf, recordDecision } from "./api";

/** Same metrics as btn-primary, drawn as a hairline outline in ink. */
const SECONDARY_BUTTON =
  "inline-flex cursor-pointer items-center justify-center rounded-none border border-rule-strong bg-transparent px-6 pt-2 pb-[0.6rem] text-[1.0625rem] leading-[1.25] font-semibold tracking-[0.08em] text-ink [font-variant-caps:all-small-caps] hover:border-ink disabled:cursor-not-allowed disabled:text-muted disabled:hover:border-rule-strong";

interface Props {
  review: ReviewView;
  /** Called with the stored row once the server has recorded the decision. */
  onSaved?: (review: ReviewView) => void;
  /** Shows a Cancel link (for revising an earlier decision). */
  onCancel?: () => void;
}

/**
 * A person's decision on one queued finding: Accept, Reject or Needs edit, with
 * an optional one-line note. The server stamps it with the user and the time.
 */
export function ReviewForm({ review, onSaved, onCancel }: Props) {
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
      // Re-render server data: the header count and, on /review, the list.
      startRefresh(() => router.refresh());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(null);
    }
  }

  const label = (status: ReviewStatus, text: string) => (pending === status ? "Saving…" : text);

  return (
    <form onSubmit={(e) => e.preventDefault()} aria-busy={busy} aria-label="Review decision" className="max-w-[68ch]">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor={noteId} className="smallcaps block text-[0.9375rem] leading-tight font-semibold text-muted">
            Note
          </label>
          <input
            id={noteId}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_REVIEW_NOTE_CHARS}
            disabled={busy}
            placeholder="Optional, kept with the decision"
            aria-describedby={hintId}
            className="mt-1.5 block w-full rounded-none border border-rule-strong bg-transparent px-3 py-2 font-serif text-[1rem] leading-normal text-ink placeholder:text-muted placeholder:italic focus:border-ink disabled:text-muted"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => decide("accepted")} disabled={busy} className="btn-primary">
            {label("accepted", "Accept")}
          </button>
          <button type="button" onClick={() => decide("rejected")} disabled={busy} className={SECONDARY_BUTTON}>
            {label("rejected", "Reject")}
          </button>
          <button type="button" onClick={() => decide("needs_edit")} disabled={busy} className={SECONDARY_BUTTON}>
            {label("needs_edit", "Needs edit")}
          </button>
        </div>
      </div>
      <p id={hintId} className="mt-2 font-mono text-[0.6875rem] leading-5 text-muted">
        Recorded as your decision, with your name and the time.
        {review.status !== "queued" ? (
          <>
            <Sep />
            <button type="button" onClick={() => decide("queued")} disabled={busy} className="link text-ink">
              {label("queued", "Return to queue")}
            </button>
          </>
        ) : null}
        {onCancel ? (
          <>
            <Sep />
            <button type="button" onClick={onCancel} disabled={busy} className="link text-ink">
              Cancel
            </button>
          </>
        ) : null}
      </p>
      <div role="alert">{error ? <p className="mt-2 text-[0.9375rem] leading-[1.5] text-accent">{error}</p> : null}</div>
    </form>
  );
}
