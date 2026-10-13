/*
 * Client-safe shapes and constants for the human review queue: no Node or
 * database imports, so client components can import this file directly
 * (./index.ts loads node:sqlite).
 *
 * A review status is only ever set by a signed-in person. The pipeline never
 * writes one; it can only be asked (by a person) to queue a finding.
 */
import type { Finding } from "@/lib/types";

export const REVIEW_STATUSES = ["queued", "accepted", "rejected", "needs_edit"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Filters for the queue page and `GET /api/review?status=`. */
export const REVIEW_FILTERS = [...REVIEW_STATUSES, "all"] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

/** Lower-case words, set in small caps by the UI. */
export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  queued: "queued",
  accepted: "accepted",
  rejected: "rejected",
  needs_edit: "needs edit",
};

export const MAX_REVIEW_NOTE_CHARS = 1000;

/** Review ids are UUIDs; anything else is treated as not found. */
export const REVIEW_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One review row as the API and UI see it. `userId`/`userName` is the person who last acted on it. */
export interface ReviewView {
  id: string;
  runId: string;
  findingId: string;
  status: ReviewStatus;
  note: string;
  userId: string;
  userName: string;
  createdAt: string; // ISO, when it was sent to review
  updatedAt: string; // ISO, the latest human action (queue or decision)
}

export type ReviewCounts = Record<ReviewFilter, number>;

/** The run a queued finding came from. */
export interface ReviewRunRef {
  id: string;
  createdAt: string;
  documentNames: string[];
}

/** A queue entry: the review, the finding exactly as stored in the report, and its run. */
export interface ReviewItem {
  review: ReviewView;
  finding: Finding;
  run: ReviewRunRef;
}
