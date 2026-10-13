import { z } from "zod";
import { MAX_REVIEW_NOTE_CHARS, REVIEW_FILTERS, REVIEW_ID_PATTERN, REVIEW_STATUSES } from "./types";

/** Route param of /api/review/[id]; a malformed id is answered like an unknown one (404). */
export const ReviewIdParam = z.object({ id: z.string().regex(REVIEW_ID_PATTERN) });

/** POST /api/review */
export const ReviewCreateInput = z.object({
  runId: z.string("runId is required.").trim().min(1, "runId is required.").max(100, "Unknown run."),
  findingId: z.string("findingId is required.").trim().min(1, "findingId is required.").max(200, "Unknown finding."),
});
export type ReviewCreateInput = z.infer<typeof ReviewCreateInput>;

/** PATCH /api/review/[id]. Omitting `note` keeps the stored one; "" clears it. */
export const ReviewUpdateInput = z.object({
  status: z.enum(REVIEW_STATUSES, `status must be one of: ${REVIEW_STATUSES.join(", ")}.`),
  note: z
    .string("note must be text.")
    .trim()
    .max(MAX_REVIEW_NOTE_CHARS, `Keep the note to ${MAX_REVIEW_NOTE_CHARS} characters.`)
    .optional(),
});
export type ReviewUpdateInput = z.infer<typeof ReviewUpdateInput>;

/** GET /api/review?status= (defaults to the open queue). */
export const ReviewListQuery = z.object({
  status: z.enum(REVIEW_FILTERS, `status must be one of: ${REVIEW_FILTERS.join(", ")}.`).default("queued"),
});
export type ReviewListQuery = z.infer<typeof ReviewListQuery>;
