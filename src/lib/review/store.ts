import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/auth";
import { findFinding, getRunReport, loadRuns, type SavedRun } from "@/lib/runs";
import {
  REVIEW_FILTERS,
  REVIEW_ID_PATTERN,
  REVIEW_STATUSES,
  type ReviewCounts,
  type ReviewFilter,
  type ReviewItem,
  type ReviewStatus,
  type ReviewView,
} from "./types";

const DEFAULT_LIST_LIMIT = 100;

/*
 * Every query joins runs and filters on runs.user_id, so a review is only ever
 * visible to (and changeable by) the owner of the run it belongs to.
 */
const SELECT_REVIEW = `
  SELECT v.id, v.run_id, v.finding_id, v.user_id, u.name AS user_name,
         v.status, v.note, v.created_at, v.updated_at
    FROM reviews v
    JOIN runs r ON r.id = v.run_id
    JOIN users u ON u.id = v.user_id`;

function toReview(row: Record<string, unknown>): ReviewView {
  const status = String(row.status);
  return {
    id: String(row.id),
    runId: String(row.run_id),
    findingId: String(row.finding_id),
    status: (REVIEW_STATUSES as readonly string[]).includes(status) ? (status as ReviewStatus) : "queued",
    note: typeof row.note === "string" ? row.note : "",
    userId: String(row.user_id),
    userName: String(row.user_name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** One of the user's reviews, or null. */
export function getReview(userId: string, reviewId: string): ReviewView | null {
  if (!REVIEW_ID_PATTERN.test(reviewId)) return null;
  const row = getDb().prepare(`${SELECT_REVIEW} WHERE r.user_id = ? AND v.id = ?`).get(userId, reviewId);
  return row ? toReview(row) : null;
}

/**
 * Sends a finding of one of the user's runs to human review. Idempotent: if the
 * finding already has a review row, that row is returned unchanged with
 * `created: false`. Null when the run is not the user's or has no such finding.
 */
export function queueReview(
  userId: string,
  runId: string,
  findingId: string,
): { review: ReviewView; created: boolean } | null {
  const report = getRunReport(userId, runId);
  if (!report || !findFinding(report, findingId)) return null;
  const now = new Date().toISOString();
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO reviews (id, run_id, finding_id, user_id, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', '', ?, ?)
       ON CONFLICT (run_id, finding_id) DO NOTHING`,
    )
    .run(randomUUID(), runId, findingId, userId, now, now);
  const row = db
    .prepare(`${SELECT_REVIEW} WHERE r.user_id = ? AND v.run_id = ? AND v.finding_id = ?`)
    .get(userId, runId, findingId);
  return row ? { review: toReview(row), created: Number(result.changes) > 0 } : null;
}

/**
 * Records a human decision (or a return to the queue). The row is stamped with
 * the acting user and the time. Null when the review is not the user's.
 */
export function updateReview(
  userId: string,
  reviewId: string,
  input: { status: ReviewStatus; note?: string },
): ReviewView | null {
  if (!REVIEW_ID_PATTERN.test(reviewId)) return null;
  const result = getDb()
    .prepare(
      `UPDATE reviews
          SET status = ?, note = COALESCE(?, note), user_id = ?, updated_at = ?
        WHERE id = ? AND run_id IN (SELECT id FROM runs WHERE user_id = ?)`,
    )
    .run(input.status, input.note ?? null, userId, new Date().toISOString(), reviewId, userId);
  if (Number(result.changes) === 0) return null;
  return getReview(userId, reviewId);
}

/** Every review on one of the user's runs. */
export function reviewsForRun(userId: string, runId: string): ReviewView[] {
  return getDb()
    .prepare(`${SELECT_REVIEW} WHERE r.user_id = ? AND v.run_id = ? ORDER BY v.created_at, v.rowid`)
    .all(userId, runId)
    .map(toReview);
}

/** Review rows per status across the user's runs, plus `all`. */
export function reviewCounts(userId: string): ReviewCounts {
  const counts = Object.fromEntries(REVIEW_FILTERS.map((f) => [f, 0])) as ReviewCounts;
  const rows = getDb()
    .prepare(
      `SELECT v.status, COUNT(*) AS n
         FROM reviews v JOIN runs r ON r.id = v.run_id
        WHERE r.user_id = ?
        GROUP BY v.status`,
    )
    .all(userId);
  for (const row of rows) {
    const status = String(row.status);
    const n = Number(row.n) || 0;
    if ((REVIEW_STATUSES as readonly string[]).includes(status)) counts[status as ReviewStatus] = n;
    counts.all += n;
  }
  return counts;
}

/** Findings waiting for a human decision (the header count). */
export function queuedReviewCount(userId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM reviews v JOIN runs r ON r.id = v.run_id
        WHERE r.user_id = ? AND v.status = 'queued'`,
    )
    .get(userId);
  return Number(row?.n) || 0;
}

export interface ReviewQueue {
  items: ReviewItem[];
  /** The runs the items came from, with document texts, for showing quotes in context. */
  runs: Map<string, SavedRun>;
  /** More rows matched than `limit`. */
  truncated: boolean;
}

/**
 * The user's reviews with the given status (or all), most recent human action
 * first, each resolved to its finding as stored in the run's report.
 */
export function listReviews(userId: string, filter: ReviewFilter, limit = DEFAULT_LIST_LIMIT): ReviewQueue {
  const rows = getDb()
    .prepare(
      `${SELECT_REVIEW}
        WHERE r.user_id = ? AND (? = 'all' OR v.status = ?)
        ORDER BY v.updated_at DESC, v.created_at DESC, v.rowid DESC
        LIMIT ?`,
    )
    .all(userId, filter, filter, limit + 1);
  const truncated = rows.length > limit;
  const reviews = rows.slice(0, limit).map(toReview);
  const runs = loadRuns(
    userId,
    reviews.map((r) => r.runId),
  );
  const items: ReviewItem[] = [];
  for (const review of reviews) {
    const run = runs.get(review.runId);
    const finding = run ? findFinding(run.report, review.findingId) : undefined;
    if (!run || !finding) continue;
    items.push({ review, finding, run: { id: run.id, createdAt: run.createdAt, documentNames: run.documentNames } });
  }
  return { items, runs, truncated };
}
